import { execFileSync, spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { claudeCode, createSandbox, type Sandbox } from '@ai-hero/sandcastle';
import { docker } from '@ai-hero/sandcastle/sandboxes/docker';
import { baseForRun } from './branch-check.ts';

/*
 * Several issues at once, each on a branch of its own, reviewed, and merged when nothing collides.
 * Run this with: pnpm sandcastle:parallel   (or `-- --plan-only`, or `-- --no-merge`)
 *
 *   round:
 *     plan       which ready, unblocked issues can be built side by side without colliding
 *     per issue  (two at a time) implement → checks → review → checks → push → pull request
 *     merge      one at a time: up to date with main, CI green, then merged — which closes it
 *   next round, until nothing can be started
 *
 * The agents never push, open pull requests, merge or close issues. This script does, on the
 * host, as the person who runs it — and only for a branch whose checks passed in the sandbox
 * and whose pull request is green in CI against the `main` it is merged into. Anything else is
 * left open, as a draft or with a comment, for a person.
 */

const MODEL = 'claude-opus-5-5';
const BASE = 'origin/main';
/** Sandboxes at once. Each runs an install, a typecheck and the API suite on a four-core box. */
const CONCURRENCY = 2;
const MAX_ROUNDS = 6;
const CHECKS = 'pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:api';
const POSTGRES_CONTAINER = 'ricambi-postgres';

const PLAN_ONLY = process.argv.includes('--plan-only');
const NO_MERGE = process.argv.includes('--no-merge');

const network =
  process.env.SANDCASTLE_NETWORK ?? `${basename(process.cwd()).toLowerCase()}_default`;

/**
 * Git and `gh` on the host run as the person, never with the sandbox's token: that one may only
 * read and comment on issues, which is all an agent is trusted with.
 */
const hostEnv: NodeJS.ProcessEnv = { ...process.env };
delete hostEnv.GH_TOKEN;
delete hostEnv.GITHUB_TOKEN;

function host(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: 'utf8',
    env: hostEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function hostStatus(command: string, args: string[]): number {
  return spawnSync(command, args, { env: hostEnv, stdio: 'ignore' }).status ?? 1;
}

function log(scope: string, message: string): void {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${scope.padEnd(10)} ${message}`);
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- What can be started -----------------------------------------------------------------------

interface Issue {
  number: number;
  title: string;
  body: string;
  labels: { name: string }[];
}

/** The numbers under an issue's `## Blocked by` heading. */
function blockersOf(issue: Issue): number[] {
  const section = /^## Blocked by\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(issue.body)?.[1] ?? '';
  return [...section.matchAll(/#(\d+)/g)].map((match) => Number(match[1]));
}

function startable(): Issue[] {
  const open = new Set(
    (
      JSON.parse(
        host('gh', ['issue', 'list', '--state', 'open', '--limit', '500', '--json', 'number']),
      ) as { number: number }[]
    ).map((issue) => issue.number),
  );
  const ready = JSON.parse(
    host('gh', [
      'issue',
      'list',
      '--state',
      'open',
      '--label',
      'ready-for-agent',
      '--limit',
      '100',
      '--json',
      'number,title,body,labels',
    ]),
  ) as Issue[];
  const inReview = new Set(
    (
      JSON.parse(
        host('gh', ['pr', 'list', '--state', 'open', '--limit', '200', '--json', 'headRefName']),
      ) as { headRefName: string }[]
    ).map((pr) => pr.headRefName),
  );

  return ready
    .filter((issue) => !issue.labels.some((label) => label.name === 'spec'))
    .filter((issue) => blockersOf(issue).every((blocker) => !open.has(blocker)))
    .filter((issue) => !inReview.has(branchOf(issue.number)))
    .sort((a, b) => a.number - b.number);
}

const branchOf = (issue: number) => `sandcastle/issue-${issue}`;

// --- The sandbox -------------------------------------------------------------------------------

/**
 * A test database per issue. The API suite names its schemas after the vitest worker, so two
 * sandboxes sharing `ricambi_test` would drop each other's tables halfway through a run.
 */
function testDatabase(issue: number): { url: string; drop: () => void } {
  const name = `ricambi_test_issue_${issue}`;
  const psql = (statement: string) =>
    host('docker', [
      'exec',
      POSTGRES_CONTAINER,
      'psql',
      '-U',
      'ricambi',
      '-d',
      'postgres',
      '-c',
      statement,
    ]);
  psql(`DROP DATABASE IF EXISTS "${name}"`);
  psql(`CREATE DATABASE "${name}"`);
  return {
    url: `postgres://ricambi:ricambi@postgres:5432/${name}`,
    drop: () => psql(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`),
  };
}

async function openSandbox(branch: string, env: Record<string, string> = {}): Promise<Sandbox> {
  return createSandbox({
    branch,
    baseBranch: BASE,
    sandbox: docker({
      network,
      env,
      mounts: [
        {
          hostPath: '~/.local/share/pnpm/store',
          sandboxPath: '/home/agent/.local/share/pnpm/store',
        },
      ],
    }),
    hooks: {
      sandbox: {
        onSandboxReady: [
          {
            command:
              'pnpm install --frozen-lockfile --store-dir /home/agent/.local/share/pnpm/store',
          },
        ],
      },
    },
  });
}

const agent = () => claudeCode(MODEL);

/** The last few lines of what the checks printed: enough for an agent to find the failure. */
const tail = (text: string, lines = 80) => text.split('\n').slice(-lines).join('\n');

async function checks(sandbox: Sandbox): Promise<{ passed: boolean; output: string }> {
  const result = await sandbox.exec(CHECKS);
  return { passed: result.exitCode === 0, output: tail(`${result.stdout}\n${result.stderr}`) };
}

async function head(sandbox: Sandbox): Promise<string> {
  return (await sandbox.exec('git rev-parse HEAD')).stdout.trim();
}

// --- Plan --------------------------------------------------------------------------------------

interface Plan {
  issues: { number: number; reason: string }[];
  deferred: { number: number; reason: string }[];
}

function readPlan(stdout: string, candidates: Issue[]): Plan {
  const last = [...stdout.matchAll(/<plan>([\s\S]*?)<\/plan>/g)].at(-1)?.[1];
  if (last === undefined) {
    throw new Error('The planner emitted no <plan>.');
  }
  const parsed = JSON.parse(last) as Partial<Plan>;
  const known = new Set(candidates.map((issue) => issue.number));
  // Only what was offered: a planner that names an issue it was not given is not believed.
  const issues = (parsed.issues ?? []).filter((entry) => known.has(Number(entry.number)));
  return {
    issues: issues.map((entry) => ({ number: Number(entry.number), reason: entry.reason })),
    deferred: parsed.deferred ?? [],
  };
}

async function plan(round: number, candidates: Issue[]): Promise<Plan> {
  if (candidates.length === 1) {
    return { issues: [{ number: candidates[0]!.number, reason: 'the only one' }], deferred: [] };
  }

  const branch = `sandcastle/planner-${Date.now()}`;
  const sandbox = await openSandbox(branch);
  try {
    const result = await sandbox.run({
      name: `planner-${round}`,
      agent: agent(),
      promptFile: './.sandcastle/plan-prompt.md',
      promptArgs: {
        CANDIDATES: JSON.stringify(
          candidates.map(({ number, title, body }) => ({ number, title, body })),
          null,
          2,
        ),
      },
      completionSignal: '</plan>',
    });
    return readPlan(result.stdout, candidates);
  } finally {
    await sandbox.close();
    hostStatus('git', ['branch', '-D', branch]);
  }
}

// --- Build one issue ---------------------------------------------------------------------------

type Built =
  { issue: Issue; outcome: 'nothing' } | { issue: Issue; outcome: 'green' | 'red'; note: string };

async function build(issue: Issue): Promise<Built> {
  const scope = `#${issue.number}`;
  const branch = branchOf(issue.number);
  baseForRun(branch);
  const base = host('git', ['rev-parse', BASE]);
  const database = testDatabase(issue.number);
  const sandbox = await openSandbox(branch, { TEST_DATABASE_URL: database.url });

  try {
    log(scope, `implementing on ${branch}`);
    const implemented = await sandbox.run({
      name: `implement-${issue.number}`,
      agent: agent(),
      promptFile: './.sandcastle/implement-prompt.md',
      promptArgs: { ISSUE_NUMBER: String(issue.number), BRANCH: branch },
      maxIterations: 3,
    });
    if (implemented.commits.length === 0) {
      log(scope, 'no commits — the agent says why on the issue');
      return { issue, outcome: 'nothing' };
    }

    let gate = await checks(sandbox);
    if (!gate.passed) {
      log(scope, 'checks failed after implementing; one attempt to fix them');
      await sandbox.run({
        name: `repair-${issue.number}`,
        agent: agent(),
        prompt:
          `You are on branch ${branch}, building issue #${issue.number}. Read AGENTS.md. ` +
          `These checks failed:\n\n${CHECKS}\n\nThe end of their output:\n\n${gate.output}\n\n` +
          'Fix the cause, run the checks again, and commit in the same form and scope as the ' +
          'work. Never push, merge or close the issue. Then output <promise>COMPLETE</promise>.',
      });
      gate = await checks(sandbox);
    }
    if (!gate.passed) {
      log(scope, 'checks still fail; left as a draft');
      return {
        issue,
        outcome: 'red',
        note: `The sandbox checks fail:\n\n\`\`\`\n${gate.output}\n\`\`\``,
      };
    }

    const beforeReview = await head(sandbox);
    log(scope, 'checks pass; reviewing');
    await sandbox.run({
      name: `review-${issue.number}`,
      agent: agent(),
      promptFile: './.sandcastle/review-prompt.md',
      promptArgs: { ISSUE_NUMBER: String(issue.number), BRANCH: branch, BASE: base },
    });

    if ((await head(sandbox)) !== beforeReview && !(await checks(sandbox)).passed) {
      // A review that breaks what passed is not kept: the work before it was green.
      log(scope, 'the review broke the checks; its commits are dropped');
      await sandbox.exec(`git reset --hard ${beforeReview}`);
      return {
        issue,
        outcome: 'green',
        note: 'The review’s changes broke the checks and were dropped.',
      };
    }
    return { issue, outcome: 'green', note: '' };
  } finally {
    await sandbox.close();
    database.drop();
  }
}

// --- Pull request and merge --------------------------------------------------------------------

function openPullRequest(built: Exclude<Built, { outcome: 'nothing' }>): number {
  const branch = branchOf(built.issue.number);
  host('git', ['push', '--force-with-lease', '-u', 'origin', branch]);

  const commits = host('git', ['log', '--format=- %s', `${BASE}..${branch}`]);
  const body = [
    `Closes #${built.issue.number}`,
    '',
    'Built, checked and reviewed by Sandcastle (`.sandcastle/parallel.ts`).',
    '',
    commits,
    ...(built.note ? ['', built.note] : []),
    '',
    '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
  ].join('\n');

  const url = host('gh', [
    'pr',
    'create',
    '--base',
    'main',
    '--head',
    branch,
    // An issue's title is a sentence about what somebody can do — what a pull request title is.
    '--title',
    built.issue.title,
    '--body',
    body,
    ...(built.outcome === 'red' ? ['--draft'] : []),
  ]);
  return Number(url.split('/').at(-1));
}

interface PullRequestState {
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  headRefOid: string;
}

async function stateOf(pr: number): Promise<PullRequestState> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = JSON.parse(
      host('gh', ['pr', 'view', String(pr), '--json', 'mergeable,headRefOid']),
    ) as PullRequestState;
    if (state.mergeable !== 'UNKNOWN') {
      return state;
    }
    await pause(15_000);
  }
  throw new Error(`GitHub never said whether #${pr} can be merged.`);
}

/** Waits for every check on the pull request's head. True when all of them passed. */
async function ciPasses(pr: number): Promise<boolean> {
  // Checks are only reported once the workflows have been picked up.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (hostStatus('gh', ['pr', 'checks', String(pr)]) !== 1 || attempt === 19) {
      break;
    }
    await pause(15_000);
  }
  return hostStatus('gh', ['pr', 'checks', String(pr), '--watch', '--interval', '30']) === 0;
}

function rerunFailed(pr: number, sha: string): void {
  const runs = JSON.parse(
    host('gh', [
      'run',
      'list',
      '--commit',
      sha,
      '--json',
      'databaseId,conclusion',
      '--limit',
      '20',
    ]),
  ) as { databaseId: number; conclusion: string }[];
  for (const run of runs.filter((run) => run.conclusion === 'failure')) {
    host('gh', ['run', 'rerun', String(run.databaseId), '--failed']);
  }
  log(
    `PR #${pr}`,
    `re-running ${runs.filter((run) => run.conclusion === 'failure').length} failed run(s) once`,
  );
}

function comment(pr: number, text: string): void {
  host('gh', ['pr', 'comment', String(pr), '--body', text]);
}

type Merged = 'merged' | 'conflict' | 'red';

/**
 * Merged only when GitHub can merge it cleanly **and** CI passed on a head that already contains
 * the `main` it goes into — so two pull requests that are each green cannot be merged into a
 * `main` that is red. One at a time, so "up to date with main" stays true until the merge.
 */
async function merge(pr: number): Promise<Merged> {
  const scope = `PR #${pr}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    host('git', ['fetch', '--quiet', 'origin']);
    const state = await stateOf(pr);
    if (state.mergeable === 'CONFLICTING') {
      comment(pr, 'Conflicts with `main` after another issue was merged. Left for a person.');
      log(scope, 'conflicts with main; left open');
      return 'conflict';
    }

    if (hostStatus('git', ['merge-base', '--is-ancestor', BASE, state.headRefOid]) !== 0) {
      log(scope, 'behind main; bringing it up to date');
      host('gh', ['pr', 'update-branch', String(pr)]);
      continue;
    }

    log(scope, 'waiting for CI');
    let green = await ciPasses(pr);
    if (!green) {
      rerunFailed(pr, state.headRefOid);
      green = await ciPasses(pr);
    }
    if (!green) {
      comment(pr, 'CI fails, and failed again when re-run. Left for a person.');
      log(scope, 'CI red twice; left open');
      return 'red';
    }

    host('git', ['fetch', '--quiet', 'origin']);
    if (hostStatus('git', ['merge-base', '--is-ancestor', BASE, state.headRefOid]) !== 0) {
      continue;
    }
    host('gh', [
      'pr',
      'merge',
      String(pr),
      '--merge',
      '--delete-branch',
      '--match-head-commit',
      state.headRefOid,
    ]);
    log(scope, 'merged');
    return 'merged';
  }
  comment(pr, '`main` kept moving while this waited for CI. Left for a person.');
  return 'red';
}

// --- Rounds ------------------------------------------------------------------------------------

/** Runs `work` over `items`, at most `limit` at a time. */
async function pool<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await work(items[index]!) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** One merge at a time, in the order the builds finish. */
let merging: Promise<unknown> = Promise.resolve();
const summary: string[] = [];

for (let round = 1; round <= MAX_ROUNDS; round += 1) {
  host('git', ['fetch', '--quiet', '--prune', 'origin']);
  const candidates = startable();
  if (candidates.length === 0) {
    log('round', 'nothing can be started');
    break;
  }

  log(
    'round',
    `${round}: planning over ${candidates.map((issue) => `#${issue.number}`).join(' ')}`,
  );
  const chosen = await plan(round, candidates);
  for (const entry of chosen.issues) log('plan', `#${entry.number} now — ${entry.reason}`);
  for (const entry of chosen.deferred) log('plan', `#${entry.number} later — ${entry.reason}`);
  if (PLAN_ONLY || chosen.issues.length === 0) {
    break;
  }

  const issues = chosen.issues.map((entry) =>
    candidates.find((issue) => issue.number === entry.number)!,
  );
  const settled = await pool(issues, CONCURRENCY, async (issue) => {
    const built = await build(issue);
    if (built.outcome === 'nothing') {
      summary.push(`#${issue.number}: nothing committed`);
      return;
    }
    const pr = openPullRequest(built);
    log(`#${issue.number}`, `pull request #${pr}${built.outcome === 'red' ? ' (draft)' : ''}`);
    if (built.outcome === 'red' || NO_MERGE) {
      summary.push(
        `#${issue.number}: PR #${pr} left open${built.outcome === 'red' ? ' as a draft' : ''}`,
      );
      return;
    }
    merging = merging.then(async () => {
      const merged = await merge(pr).catch((error: unknown) => {
        log(`PR #${pr}`, `merge failed: ${String(error)}`);
        return 'red' as const;
      });
      summary.push(
        `#${issue.number}: PR #${pr} ${merged === 'merged' ? 'merged' : `left open (${merged})`}`,
      );
    });
  });
  await merging;

  for (const [index, outcome] of settled.entries()) {
    if (outcome.status === 'rejected') {
      summary.push(`#${issues[index]!.number}: failed — ${String(outcome.reason)}`);
    }
  }
}

console.log(`\nDone.\n${summary.map((line) => `  ${line}`).join('\n') || '  Nothing was built.'}`);
