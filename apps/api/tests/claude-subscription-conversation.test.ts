import type { Options, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import {
  createClaudeSubscriptionConversationMethod,
  machineLoginAvailable,
  type AgentQuery,
} from '../src/proposals/claude-subscription-conversation-method.js';
import {
  ConversationUnavailableError,
  type Conversation,
} from '../src/proposals/conversation-method.js';
import { PLAYBOOK } from '../src/proposals/playbook.js';
import type { ClaudeCli } from '../src/reading/claude-subscription-method.js';

/**
 * **What the `subscription` conversation method asks of Claude Code** (issue #156), checked
 * against a stand-in for the Agent SDK. No test calls a model (ADR 0017): what is asserted is what
 * it would be started with — no tool, no credential but the machine's login — and what is made of
 * what comes back.
 */
describe('a Proposal’s conversation with Claude through this machine’s login', () => {
  const KEY = 'sk-ant-test-0000-not-a-real-key';
  const TOKEN = 'sk-ant-oat01-test-not-a-real-token';
  const ENV = {
    PATH: '/usr/bin',
    HOME: '/home/someone',
    ANTHROPIC_API_KEY: KEY,
    ANTHROPIC_AUTH_TOKEN: TOKEN,
    CLAUDE_CODE_OAUTH_TOKEN: TOKEN,
    PROPOSALS_ANTHROPIC_API_KEY: KEY,
  };

  interface Asked {
    options: Options;
    messages: SDKUserMessage[];
  }

  function givenClaudeCode(...said: unknown[]): { query: AgentQuery; asked: Asked[] } {
    const asked: Asked[] = [];
    return {
      asked,
      query: ({ prompt, options }) =>
        (async function* () {
          const messages: SDKUserMessage[] = [];
          for await (const message of prompt) {
            messages.push(message);
          }
          asked.push({ options, messages });
          for (const line of said) {
            yield line as SDKMessage;
          }
        })(),
    };
  }

  const init = {
    type: 'system',
    subtype: 'init',
    apiKeySource: 'none',
    model: 'claude-sonnet-5-5',
  };
  const delta = (text: string) => ({
    type: 'stream_event',
    event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  });
  const finished = (fields: Record<string, unknown> = {}) => ({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: '',
    stop_reason: 'end_turn',
    ...fields,
  });

  const documents = [
    { path: 'GLOSSARY.md', text: '**Tavola**: a page of the factory catalog.' },
    { path: 'docs/adr/0001-part-identity.md', text: 'A Part is its Catalog Number.' },
  ];

  const conversation: Conversation = {
    kind: 'idea',
    context: {
      pageAddress: '/tavole/84',
      version: '9.8.7',
      model: { id: 'model-1', name: 'Iso Rivolta' },
      tavola: { id: 'tavola-1', number: '84', name: 'Rear axle' },
    },
    earlier: [{ kind: 'fix', title: 'The drawing does not open', status: 'declined' }],
    turns: [
      {
        speaker: 'author',
        text: 'Mitglieder könnten ihr eigenes Auto eintragen.',
        screenshots: [
          { note: 'Hier fehlt etwas', mediaType: 'image/webp', data: Buffer.from('a picture') },
        ],
      },
      { speaker: 'conversation', text: 'Für wen wäre das?', screenshots: [] },
      { speaker: 'author', text: 'Für jedes Mitglied.', screenshots: [] },
    ],
  };

  const methodFor = (query: AgentQuery) =>
    createClaudeSubscriptionConversationMethod({ documents, env: ENV, query });

  async function heard(answer: AsyncIterable<string>): Promise<string[]> {
    const pieces: string[] = [];
    for await (const piece of answer) {
      pieces.push(piece);
    }
    return pieces;
  }

  it('streams the answer as it is written, on Sonnet 5.5 at high effort', async () => {
    const claude = givenClaudeCode(
      init,
      delta('Wer '),
      delta('trägt es '),
      delta('ein?'),
      finished(),
    );

    expect(await heard(methodFor(claude.query).answer(conversation))).toEqual([
      'Wer ',
      'trägt es ',
      'ein?',
    ]);
    expect(claude.asked[0]?.options).toMatchObject({
      model: 'claude-sonnet-5-5',
      includePartialMessages: true,
    });
    expect(claude.asked[0]?.options.effort).toBe('high');
  });

  it('switches every tool off, and nothing of the machine’s own setup can bring one back', async () => {
    const claude = givenClaudeCode(init, delta('Noted.'), finished());

    await heard(methodFor(claude.query).answer(conversation));

    expect(claude.asked[0]?.options).toMatchObject({
      tools: [],
      allowedTools: [],
      permissionMode: 'dontAsk',
      mcpServers: {},
      strictMcpConfig: true,
      settingSources: [],
      skills: [],
      plugins: [],
      persistSession: false,
    });
    expect(claude.asked[0]?.options.canUseTool).toBeUndefined();
    expect(claude.asked[0]?.options.agents).toBeUndefined();
  });

  it('signs in with nothing but the machine’s login: no key and no token reach Claude Code', async () => {
    const claude = givenClaudeCode(init, delta('Noted.'), finished());

    await heard(methodFor(claude.query).answer(conversation));

    const env = claude.asked[0]?.options.env ?? {};
    expect(env).toMatchObject({ PATH: '/usr/bin', HOME: '/home/someone' });
    for (const name of [
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_AUTH_TOKEN',
      'CLAUDE_CODE_OAUTH_TOKEN',
      'PROPOSALS_ANTHROPIC_API_KEY',
    ]) {
      expect(env[name]).toBeUndefined();
    }
    expect(JSON.stringify(env)).not.toMatch(/sk-ant/);
  });

  it('refuses a session that would talk with an API key', async () => {
    const claude = givenClaudeCode(
      { ...init, apiKeySource: 'ANTHROPIC_API_KEY' },
      delta('Noted.'),
      finished(),
    );

    const failure = await heard(methodFor(claude.query).answer(conversation)).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ConversationUnavailableError);
    expect(String((failure as Error).message)).toMatch(/not this machine’s login/);
  });

  it('tells it the playbook, the documents and this Proposal’s facts', async () => {
    const claude = givenClaudeCode(init, delta('Noted.'), finished());

    await heard(methodFor(claude.query).answer(conversation));

    const [playbook, bundled, facts, ...rest] = claude.asked[0]?.options.systemPrompt as string[];
    expect(rest).toEqual([]);
    expect(playbook).toBe(PLAYBOOK);
    for (const document of documents) {
      expect(bundled).toContain(`<document path="${document.path}">\n${document.text}`);
    }
    expect(facts).toContain('an Idea');
    expect(facts).toContain('/tavole/84');
    expect(facts).toContain('Ricambi 9.8.7');
    expect(facts).toContain('Tavola 84, Rear axle');
    expect(facts).toContain('Fix: The drawing does not open (declined)');
  });

  it('shows it the turns in order, each screenshot as a picture behind its note', async () => {
    const claude = givenClaudeCode(init, delta('Noted.'), finished());

    await heard(methodFor(claude.query).answer(conversation));

    expect(claude.asked[0]?.messages).toHaveLength(1);
    const content = claude.asked[0]?.messages[0]?.message.content as {
      type: string;
      text?: string;
      source?: unknown;
    }[];
    expect(content.slice(1)).toEqual([
      { type: 'text', text: "Screenshot 1, with the author's note: Hier fehlt etwas" },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/webp',
          data: Buffer.from('a picture').toString('base64'),
        },
      },
      { type: 'text', text: '<author>\nMitglieder könnten ihr eigenes Auto eintragen.\n</author>' },
      { type: 'text', text: '<your-answer>\nFür wen wäre das?\n</your-answer>' },
      { type: 'text', text: '<author>\nFür jedes Mitglied.\n</author>' },
    ]);
  });

  it('writes the finished Proposal as structured output in the shape of its kind', async () => {
    const idea = {
      title: 'Members note their own car',
      problem: 'A member cannot say which car they own.',
      forWhom: ['member'],
      whatItShouldDo: 'Let every Member note their own car.',
      decisions: ['It is for every Member.'],
      openQuestions: ['Who else sees it?'],
      newTerms: [],
    };
    const claude = givenClaudeCode(init, finished({ structured_output: idea }));

    const summary = await methodFor(claude.query).summarise(conversation);

    expect(summary).toEqual({ kind: 'idea', ...idea, model: 'claude-sonnet-5-5' });
    const { options, messages } = claude.asked[0] ?? {};
    expect(options?.outputFormat?.type).toBe('json_schema');
    expect(JSON.stringify(options?.outputFormat?.schema)).toContain('forWhom');
    expect(options?.tools).toEqual([]);
    const content = messages?.[0]?.message.content as { type: string; text?: string }[];
    expect(content.at(-1)?.text).toMatch(/Write the finished Proposal now/);
  });

  it('asks for a Fix in the shape of a Fix', async () => {
    const fix = {
      title: 'The drawing does not open',
      whatHappened: 'Nothing happens when the drawing is pressed.',
      whatWasExpected: 'The drawing opens.',
      steps: ['Open Tavola 84.', 'Press the drawing.'],
      where: 'Tavola 84',
    };
    const claude = givenClaudeCode(init, finished({ structured_output: fix }));

    const summary = await methodFor(claude.query).summarise({ ...conversation, kind: 'fix' });

    expect(summary).toEqual({ kind: 'fix', ...fix, model: 'claude-sonnet-5-5' });
    expect(JSON.stringify(claude.asked[0]?.options.outputFormat?.schema)).toContain(
      'whatWasExpected',
    );
  });

  it('reports a Proposal it could not read, an error, the plan’s limit or a refusal as unavailable', async () => {
    const cut = givenClaudeCode(init, finished({ structured_output: { title: 'Half' } }));
    await expect(methodFor(cut.query).summarise(conversation)).rejects.toBeInstanceOf(
      ConversationUnavailableError,
    );

    for (const result of [
      finished({ is_error: true, result: 'API Error: 500 Internal server error' }),
      finished({ is_error: true, result: 'You’ve hit your limit · resets 5pm' }),
      finished({ stop_reason: 'refusal' }),
      { type: 'result', subtype: 'error_during_execution', is_error: true, errors: [] },
    ]) {
      const claude = givenClaudeCode(init, result);
      await expect(heard(methodFor(claude.query).answer(conversation))).rejects.toBeInstanceOf(
        ConversationUnavailableError,
      );
    }

    const missing: AgentQuery = () => {
      throw new Error('spawn claude ENOENT');
    };
    await expect(heard(methodFor(missing).answer(conversation))).rejects.toThrow(
      /could not be started/,
    );
  });

  it('names itself by the model and the login, never by a credential', () => {
    const method = createClaudeSubscriptionConversationMethod({ documents, env: ENV });
    expect(method.name).toBe('Claude (claude-sonnet-5-5) with this machine’s Claude Code login');
  });
});

describe('the machine’s own Claude Code login', () => {
  const TOKEN = 'sk-ant-oat01-test-not-a-real-token';
  const ENV = { PATH: '/usr/bin', HOME: '/home/someone', CLAUDE_CODE_OAUTH_TOKEN: TOKEN };

  function givenAuthStatus(status: Record<string, unknown>) {
    const started: { args: string[]; env: NodeJS.ProcessEnv }[] = [];
    const cli: ClaudeCli = async (args, { env }) => {
      started.push({ args, env });
      return { code: 0, stdout: JSON.stringify(status), stderr: '' };
    };
    return { cli, started };
  }

  it('is found where Claude Code is signed in with a subscription, asked without any token', async () => {
    const signedIn = givenAuthStatus({ loggedIn: true, authMethod: 'claude.ai' });

    expect(await machineLoginAvailable({ cli: signedIn.cli, env: ENV })).toBe(true);
    expect(signedIn.started[0]?.args).toEqual(['auth', 'status', '--json']);
    expect(signedIn.started[0]?.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });

  it('is not a token, a key, or nobody signed in', async () => {
    for (const status of [
      { loggedIn: true, authMethod: 'oauth_token' },
      { loggedIn: true, authMethod: 'api_key' },
      { loggedIn: false, authMethod: 'none' },
    ]) {
      const claude = givenAuthStatus(status);
      expect(await machineLoginAvailable({ cli: claude.cli, env: ENV })).toBe(false);
    }

    const missing: ClaudeCli = async () => {
      throw new Error('spawn claude ENOENT');
    };
    expect(await machineLoginAvailable({ cli: missing, env: ENV })).toBe(false);
  });
});
