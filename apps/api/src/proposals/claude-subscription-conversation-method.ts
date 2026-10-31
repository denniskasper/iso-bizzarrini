import { tmpdir } from 'node:os';
import type Anthropic from '@anthropic-ai/sdk';
import type { Options, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { claudeCli, type ClaudeCli } from '../reading/claude-subscription-method.js';
import type { BundledDocument } from './bundled-documents.js';
import { CONVERSATION_MODEL } from './claude-api-conversation-method.js';
import {
  ConversationUnavailableError,
  type Conversation,
  type ConversationMethod,
  type ConversationTurn,
} from './conversation-method.js';
import { factsOf, PLAYBOOK, SUMMARY_SCHEMA, WRITE_THE_PROPOSAL } from './playbook.js';

/**
 * **Claude, reached with this machine's own Claude Code login** (issue #156): Development's
 * conversation method, so that the developer tries the real conversation on their own
 * subscription and spends no API money.
 *
 * It runs Claude Code through the Claude Agent SDK with **every tool switched off**, no settings,
 * skills, plugins or MCP servers of the machine's, and nothing kept of the session, so it can only
 * talk. It is told what the `api-key` method is told — the playbook, the bundled documents, this
 * Proposal's facts, the turns with their screenshots — and writes the finished Proposal as
 * structured output in the same shape.
 *
 * It signs in **only with the login already on the machine** (ADR 0012, as amended): every API
 * key and every token is taken out of Claude Code's environment, and a session that still reports
 * a key as its source is refused rather than answered. A server container has no signed-in
 * Claude Code, so nobody's personal subscription can be handed to one through its environment.
 *
 * The SDK is a development dependency: it is never in the image, where this method can never run.
 */
export interface ClaudeSubscriptionConversationOptions {
  documents: BundledDocument[];
  /** The environment Claude Code is started from; every credential in it is removed. */
  env?: NodeJS.ProcessEnv;
  /** The Agent SDK's `query`, unless a test stands in for it. */
  query?: AgentQuery;
}

/** What this method needs of the Agent SDK's `query`. */
export type AgentQuery = (params: {
  prompt: AsyncIterable<SDKUserMessage>;
  options: Options;
}) => AsyncIterable<SDKMessage>;

/**
 * Everything in the environment that would make Claude Code talk with something other than the
 * machine's login: an API key, a token handed in, or a cloud provider billed per use.
 * `CLAUDECODE` goes too, so the server can be started from within a Claude Code session.
 */
const NOT_THE_MACHINE_LOGIN = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_REFRESH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  'CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDECODE',
  'PROPOSALS_ANTHROPIC_API_KEY',
];

/** The environment with every credential but the machine's own login taken out. */
export function machineLoginEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const kept = { ...env };
  for (const name of NOT_THE_MACHINE_LOGIN) {
    delete kept[name];
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

export function createClaudeSubscriptionConversationMethod(
  options: ClaudeSubscriptionConversationOptions,
): ConversationMethod {
  const env = machineLoginEnvironment(options.env ?? process.env);
  const documents = options.documents
    .map((document) => `<document path="${document.path}">\n${document.text}\n</document>`)
    .join('\n\n');

  async function queryOf(): Promise<AgentQuery> {
    if (options.query) {
      return options.query;
    }
    try {
      return (await import('@anthropic-ai/claude-agent-sdk')).query;
    } catch {
      throw new ConversationUnavailableError(
        'The Claude Agent SDK is not installed here. It is a development dependency.',
      );
    }
  }

  function optionsFor(conversation: Conversation): Options {
    return {
      model: CONVERSATION_MODEL,
      systemPrompt: [
        PLAYBOOK,
        `Ricambi's glossary, product spec and decisions, as of the Version running:\n\n${documents}`,
        factsOf(conversation),
      ],
      // Nothing but talk: no tool, and nothing of the machine's own configuration that could
      // bring one back.
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

  /** Runs one request, and hands back what it printed, refusing anything but the login. */
  async function* asked(
    conversation: Conversation,
    content: Anthropic.ContentBlockParam[],
    extra: Partial<Options>,
  ): AsyncGenerator<SDKMessage> {
    const query = await queryOf();
    const message: SDKUserMessage = {
      type: 'user',
      parent_tool_use_id: null,
      message: { role: 'user', content },
    };
    async function* prompt(): AsyncGenerator<SDKUserMessage> {
      yield message;
    }

    let run: AsyncIterable<SDKMessage>;
    try {
      run = query({ prompt: prompt(), options: { ...optionsFor(conversation), ...extra } });
    } catch {
      throw notStarted();
    }
    try {
      for await (const line of run) {
        if (line.type === 'system' && line.subtype === 'init' && line.apiKeySource !== 'none') {
          throw new ConversationUnavailableError(
            'Claude Code was about to talk with an API key, not this machine’s login, so it was ' +
              'stopped. Remove the key from its settings.',
          );
        }
        if (line.type === 'result') {
          checked(line);
        }
        yield line;
      }
    } catch (error) {
      throw error instanceof ConversationUnavailableError ? error : notStarted();
    }
  }

  return {
    name: `Claude (${CONVERSATION_MODEL}) with this machine’s Claude Code login`,

    async *answer(conversation) {
      for await (const line of asked(conversation, transcriptOf(conversation.turns), {
        includePartialMessages: true,
      })) {
        if (
          line.type === 'stream_event' &&
          line.event.type === 'content_block_delta' &&
          line.event.delta.type === 'text_delta'
        ) {
          yield line.event.delta.text;
        }
      }
    },

    async summarise(conversation) {
      const schema = SUMMARY_SCHEMA[conversation.kind];
      let output: unknown;
      for await (const line of asked(
        conversation,
        [...transcriptOf(conversation.turns), { type: 'text', text: WRITE_THE_PROPOSAL }],
        {
          outputFormat: {
            type: 'json_schema',
            schema: z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>,
          },
        },
      )) {
        if (line.type === 'result' && line.subtype === 'success') {
          output = line.structured_output;
        }
      }

      if (conversation.kind === 'fix') {
        const parsed = SUMMARY_SCHEMA.fix.safeParse(output);
        if (parsed.success) {
          return { kind: 'fix', ...parsed.data, model: CONVERSATION_MODEL };
        }
      } else {
        const parsed = SUMMARY_SCHEMA.idea.safeParse(output);
        if (parsed.success) {
          return { kind: 'idea', ...parsed.data, model: CONVERSATION_MODEL };
        }
      }
      throw new ConversationUnavailableError(
        'The model’s Proposal was cut short or could not be read.',
      );
    },
  };
}

/**
 * The turns as one message, since Claude Code takes a conversation's history only as its own
 * session: each turn named by who said it, the author's screenshots as images behind their notes.
 */
function transcriptOf(turns: ConversationTurn[]): Anthropic.ContentBlockParam[] {
  const content: Anthropic.ContentBlockParam[] = [
    {
      type: 'text',
      text: 'The conversation so far, oldest first. Your own earlier answers are marked as yours.',
    },
  ];
  for (const turn of turns) {
    if (turn.speaker === 'conversation') {
      if (turn.text !== '') {
        content.push({ type: 'text', text: `<your-answer>\n${turn.text}\n</your-answer>` });
      }
      continue;
    }
    turn.screenshots.forEach((shot, index) => {
      content.push(
        {
          type: 'text',
          text:
            shot.note === null
              ? `Screenshot ${index + 1}:`
              : `Screenshot ${index + 1}, with the author's note: ${shot.note}`,
        },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: shot.mediaType,
            data: shot.data.toString('base64'),
          },
        },
      );
    });
    if (turn.text !== '') {
      content.push({ type: 'text', text: `<author>\n${turn.text}\n</author>` });
    }
  }
  return content;
}

/** How Claude Code words a plan that will answer no more for now. */
const USAGE_LIMIT = /usage limit|hit your (?:\w+ )?limit|limit reached|out of (?:extra )?usage/i;

/**
 * A finished request that did not answer is the conversation being unavailable. The plan's usage
 * limit is not the workspace's monthly one, and lifts within hours, so it is not told as paused.
 */
function checked(result: Extract<SDKMessage, { type: 'result' }>): void {
  if (result.is_error || result.subtype !== 'success') {
    const said = 'result' in result ? firstLine(result.result) : result.subtype;
    if (USAGE_LIMIT.test(said)) {
      throw new ConversationUnavailableError(`The subscription’s usage limit was reached: ${said}`);
    }
    throw new ConversationUnavailableError(`Claude Code answered with an error: ${said}`);
  }
  if (result.stop_reason === 'refusal') {
    throw new ConversationUnavailableError('The model declined to answer.');
  }
}

function notStarted(): ConversationUnavailableError {
  return new ConversationUnavailableError(
    'Claude Code could not be started, or stopped without an answer. Is it signed in on this ' +
      'machine with `claude auth login`?',
  );
}

function firstLine(text: string): string {
  return (text.trim().split('\n')[0] ?? '').slice(0, 200);
}
