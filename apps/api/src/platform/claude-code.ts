import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import type { Options, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

/**
 * **Claude Code on the developer's machine, signed in with their own subscription** (issue #151):
 * what both Development uses of Claude run on, catalog reading and Proposals' conversation.
 *
 * Only the login already on the machine is accepted (ADR 0012, as amended). Every API key, token
 * or per-use cloud provider is taken out of Claude Code's environment, so nothing but that login
 * can pay, and nobody's subscription can be handed to a server through its environment. A server
 * has no Claude Code at all: the image does not carry it, and the Agent SDK is a development
 * dependency.
 */

/** Runs `claude` with these arguments, this standard input and this environment. */
export type ClaudeCli = (
  args: string[],
  options: { input: string; env: NodeJS.ProcessEnv },
) => Promise<ClaudeCliRun>;

export interface ClaudeCliRun {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** What Ricambi needs of the Agent SDK's `query`. */
export type AgentQuery = (params: {
  prompt: AsyncIterable<SDKUserMessage>;
  options: Options;
}) => AsyncIterable<SDKMessage>;

/**
 * Everything in the environment that would make Claude Code sign in with something other than the
 * machine's login: an API key, a token handed in, or a cloud provider billed per use. `CLAUDECODE`
 * goes too, so the server can be started from within a Claude Code session.
 */
const NOT_THE_MACHINE_LOGIN = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDECODE',
  'PROPOSALS_ANTHROPIC_API_KEY',
];

/** Every way of handing Claude Code an OAuth token or a key, whatever it is called next. */
const HANDED_IN = /^CLAUDE_CODE_(?:OAUTH|API_KEY)_/;

/** The environment with every credential but the machine's own login taken out. */
export function machineLoginEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const kept = { ...env };
  for (const name of Object.keys(kept)) {
    if (NOT_THE_MACHINE_LOGIN.includes(name) || HANDED_IN.test(name)) {
      delete kept[name];
    }
  }
  return kept;
}

/**
 * **Whether Claude Code on this machine is signed in with a Claude subscription**, asked with
 * every key and token taken away, so a token in the environment never counts as the login.
 */
export async function machineLoginAvailable(
  options: { cli?: ClaudeCli; env?: NodeJS.ProcessEnv } = {},
): Promise<boolean> {
  const cli = options.cli ?? claudeCli();
  try {
    const run = await cli(['auth', 'status', '--json'], {
      input: '',
      env: machineLoginEnvironment(options.env ?? process.env),
    });
    const status = JSON.parse(run.stdout) as { loggedIn?: unknown; authMethod?: unknown };
    return status.loggedIn === true && status.authMethod === 'claude.ai';
  } catch {
    return false;
  }
}

/**
 * The Agent SDK's `query`, or `null` where it is not installed: it is a development dependency,
 * and never in the image.
 */
export async function agentQuery(): Promise<AgentQuery | null> {
  try {
    return (await import('@anthropic-ai/claude-agent-sdk')).query;
  } catch {
    return null;
  }
}

/**
 * What every request to Claude Code is started with, whatever it is for: no tool, nothing of the
 * machine's own configuration that could bring one back, nothing kept of the session, run in a
 * directory with nothing in it, and signed in only with the machine's login.
 */
export function isolatedSessionOptions(env: NodeJS.ProcessEnv): Options {
  return {
    tools: [],
    allowedTools: [],
    permissionMode: 'dontAsk',
    mcpServers: {},
    strictMcpConfig: true,
    settingSources: [],
    skills: [],
    plugins: [],
    persistSession: false,
    cwd: tmpdir(),
    env,
  };
}

/** How Claude Code words a plan that will answer no more for now. */
export const USAGE_LIMIT =
  /usage limit|hit your (?:\w+ )?limit|limit reached|out of (?:extra )?usage/i;

/** Claude Code, run in a directory of its own with nothing in it to read. */
export function claudeCli(command = 'claude'): ClaudeCli {
  return (args, { input, env }) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, args, { env, cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, stdout, stderr }));
      child.stdin.on('error', () => undefined);
      child.stdin.end(input);
    });
}
