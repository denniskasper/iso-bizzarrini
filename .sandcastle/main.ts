import { basename } from 'node:path';
import { run, claudeCode } from '@ai-hero/sandcastle';
import { docker } from '@ai-hero/sandcastle/sandboxes/docker';

// Simple loop: an agent that picks `ready-for-agent` issues one by one and leaves its work on
// the `sandcastle/work` branch for a person to review.
// Run this with: pnpm sandcastle

await run({
  // A name for this run, shown as a prefix in log output.
  name: 'worker',

  // Sandbox provider — runs the agent inside an isolated container.
  sandbox: docker({
    // The development Postgres from docker-compose.yml, so the agent can run the API test
    // suite against a real database as the suite requires. `pnpm sandcastle` starts it first.
    // Compose names the network after the directory the repository is checked out in.
    network: process.env.SANDCASTLE_NETWORK ?? `${basename(process.cwd()).toLowerCase()}_default`,
    env: {
      TEST_DATABASE_URL: 'postgres://ricambi:ricambi@postgres:5432/ricambi_test',
    },
    // The host's pnpm store, shared with the sandbox, so installing links packages that are
    // already on this machine instead of downloading all of them again on every run.
    mounts: [
      {
        hostPath: '~/.local/share/pnpm/store',
        sandboxPath: '/home/agent/.local/share/pnpm/store',
      },
    ],
  }),

  // The agent provider. Pass a model string to claudeCode() — sonnet balances
  // capability and speed for most tasks. Switch to claude-opus-4-8 for harder
  // problems, or claude-haiku-4-5-20251001 for speed.
  agent: claudeCode('claude-opus-5-5'),

  // Path to the prompt file. Shell expressions inside are evaluated inside the
  // sandbox at the start of each iteration, so the agent always sees fresh data.
  promptFile: './.sandcastle/prompt.md',

  // Maximum number of iterations (agent invocations) to run in a session.
  // Each iteration works on a single issue. Increase this to process more issues
  // per run, or set it to 1 for a single-shot mode.
  maxIterations: 4,

  // Branch strategy — the agent's commits land on a branch of their own and are never merged
  // into whatever is checked out. Everything in this repository reaches `main` through a pull
  // request with CI behind it, and the sandbox cannot run the test suites; so what a run
  // produces is a branch to open a pull request from, not a change to `main`.
  branchStrategy: { type: 'branch', branch: 'sandcastle/work' },

  // Lifecycle hooks — commands grouped by where they run (host or sandbox).
  hooks: {
    sandbox: {
      // onSandboxReady runs once after the sandbox is initialised and the repo is
      // synced in, before the agent starts. Use it to install dependencies or run
      // any other setup steps your project needs.
      // Nothing is copied in from the host: pnpm refuses a `node_modules` it did not lay out
      // itself, so the install is done here, from the shared store mounted above.
      onSandboxReady: [
        {
          // The store is named outright: left to itself pnpm keeps one beside the project when
          // its usual one is on another mount, and would download everything into the worktree.
          command: 'pnpm install --frozen-lockfile --store-dir /home/agent/.local/share/pnpm/store',
        },
      ],
    },
  },
});
