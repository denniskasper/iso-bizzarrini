import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { readBundledDocuments } from '../src/proposals/bundled-documents.js';
import {
  CONVERSATION_MODEL,
  createClaudeApiConversationMethod,
} from '../src/proposals/claude-api-conversation-method.js';
import {
  ConversationPausedError,
  ConversationUnavailableError,
  type Conversation,
} from '../src/proposals/conversation-method.js';
import { PLAYBOOK } from '../src/proposals/playbook.js';

/**
 * **The requests the `api-key` conversation method sends** (issue #155), checked against a
 * stand-in for the API on this machine. No test calls a model (ADR 0017), and none needs a key:
 * what is asserted is what would be sent, what is made of the answer, and that the provider's
 * spending limit is told apart from everything else that can go wrong.
 */
describe('a Proposal’s conversation with Claude through an API key', () => {
  const KEY = 'sk-ant-test-0000-not-a-real-key';
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
    server = undefined;
  });

  interface Block {
    type: string;
    text?: string;
    cache_control?: { type: string; ttl?: string };
    source?: { type: string; media_type: string; data: string };
  }

  interface Received {
    headers: IncomingHttpHeaders;
    body: {
      model: string;
      stream?: boolean;
      system: Block[];
      messages: { role: string; content: string | Block[] }[];
      output_config?: { effort?: string; format?: { type: string; schema: unknown } };
    };
  }

  type Reply =
    { stream: string[] } | { json: unknown } | { status: number; type: string; message: string };

  async function givenTheApi(reply: Reply): Promise<{ url: string; received: Received[] }> {
    const received: Received[] = [];
    server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        received.push({ headers: request.headers, body: JSON.parse(body) });
        if ('status' in reply) {
          response.writeHead(reply.status, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({ type: 'error', error: { type: reply.type, message: reply.message } }),
          );
        } else if ('stream' in reply) {
          response.writeHead(200, { 'content-type': 'text/event-stream' });
          response.end(streamed(reply.stream));
        } else {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({
              id: 'msg_1',
              type: 'message',
              role: 'assistant',
              model: CONVERSATION_MODEL,
              content: [{ type: 'text', text: JSON.stringify(reply.json) }],
              stop_reason: 'end_turn',
              stop_sequence: null,
              usage: { input_tokens: 1500, output_tokens: 300 },
            }),
          );
        }
      });
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return { url: `http://127.0.0.1:${port}`, received };
  }

  /** An answer as the API streams it: one text block, a delta per piece. */
  function streamed(pieces: string[]): string {
    const events: unknown[] = [
      {
        type: 'message_start',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: CONVERSATION_MODEL,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1500, output_tokens: 1 },
        },
      },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      ...pieces.map((text) => ({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text },
      })),
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 30 },
      },
      { type: 'message_stop' },
    ];
    return events
      .map(
        (event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`,
      )
      .join('');
  }

  const documents = [
    { path: 'GLOSSARY.md', text: '**Tavola**: a page of the factory catalog.' },
    { path: 'docs/spec.md', text: 'The spec.' },
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

  const methodFor = (url: string) =>
    createClaudeApiConversationMethod({ apiKey: KEY, documents, baseURL: url, maxRetries: 0 });

  async function heard(answer: AsyncIterable<string>): Promise<string[]> {
    const pieces: string[] = [];
    for await (const piece of answer) {
      pieces.push(piece);
    }
    return pieces;
  }

  it('streams the answer as it is written, on Opus 5.5 at its default effort', async () => {
    const api = await givenTheApi({ stream: ['Wer ', 'trägt es ', 'ein?'] });

    expect(await heard(methodFor(api.url).answer(conversation))).toEqual([
      'Wer ',
      'trägt es ',
      'ein?',
    ]);

    const [request] = api.received;
    expect(request?.headers['x-api-key']).toBe(KEY);
    expect(request?.body).toMatchObject({ model: 'claude-opus-5-5', stream: true });
    expect(request?.body.output_config?.effort).toBeUndefined();
  });

  it('sends the playbook, then the documents cached for an hour, then this Proposal’s facts', async () => {
    const api = await givenTheApi({ stream: ['Noted.'] });

    await heard(methodFor(api.url).answer(conversation));

    const [playbook, bundled, facts, ...rest] = api.received[0]?.body.system ?? [];
    expect(rest).toEqual([]);
    expect(playbook).toEqual({ type: 'text', text: PLAYBOOK });
    expect(bundled?.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    for (const document of documents) {
      expect(bundled?.text).toContain(`<document path="${document.path}">\n${document.text}`);
    }
    // Nothing of this Proposal is in the cached part, so it is the same for every conversation.
    expect(playbook?.text).not.toMatch(/Rivolta|9\.8\.7/);
    expect(bundled?.text).not.toMatch(/Rivolta|9\.8\.7/);
    expect(facts?.cache_control).toBeUndefined();
    expect(facts?.text).toContain('an Idea');
    expect(facts?.text).toContain('/tavole/84');
    expect(facts?.text).toContain('Ricambi 9.8.7');
    expect(facts?.text).toContain('Iso Rivolta');
    expect(facts?.text).toContain('Tavola 84, Rear axle');
    expect(facts?.text).toContain('What should Ricambi do?');
    expect(facts?.text).toContain('Fix: The drawing does not open (declined)');
  });

  it('sends the turns in order, each screenshot as a picture behind its note', async () => {
    const api = await givenTheApi({ stream: ['Noted.'] });

    await heard(methodFor(api.url).answer(conversation));

    const messages = api.received[0]?.body.messages ?? [];
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
    expect(messages[0]?.content).toEqual([
      { type: 'text', text: "Screenshot 1, with the author's note: Hier fehlt etwas" },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/webp',
          data: Buffer.from('a picture').toString('base64'),
        },
      },
      { type: 'text', text: 'Mitglieder könnten ihr eigenes Auto eintragen.' },
    ]);
    expect(messages[1]?.content).toBe('Für wen wäre das?');
    expect(messages[2]?.content).toEqual([{ type: 'text', text: 'Für jedes Mitglied.' }]);
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
    const api = await givenTheApi({ json: idea });

    const summary = await methodFor(api.url).summarise(conversation);

    expect(summary).toEqual({ kind: 'idea', ...idea, model: 'claude-opus-5-5' });
    const [request] = api.received;
    expect(request?.body.output_config?.format?.type).toBe('json_schema');
    expect(JSON.stringify(request?.body.output_config?.format?.schema)).toContain('forWhom');
    expect(request?.body.system[1]?.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    // The turns, then the request for the Proposal.
    expect(request?.body.messages).toHaveLength(4);
    expect(request?.body.messages.at(-1)).toMatchObject({ role: 'user' });
  });

  it('asks for a Fix in the shape of a Fix', async () => {
    const fix = {
      title: 'The drawing does not open',
      whatHappened: 'Nothing happens when the drawing is pressed.',
      whatWasExpected: 'The drawing opens.',
      steps: ['Open Tavola 84.', 'Press the drawing.'],
      where: 'Tavola 84',
    };
    const api = await givenTheApi({ json: fix });

    const summary = await methodFor(api.url).summarise({ ...conversation, kind: 'fix' });

    expect(summary).toEqual({ kind: 'fix', ...fix, model: 'claude-opus-5-5' });
    expect(JSON.stringify(api.received[0]?.body.output_config?.format?.schema)).toContain(
      'whatWasExpected',
    );
  });

  it('reports the workspace’s spending limit as paused, while answering and while finishing', async () => {
    const limit = {
      status: 400,
      type: 'invalid_request_error',
      message:
        'You have reached your specified workspace API usage limits. You will regain access on ' +
        '2026-12-01 at 00:00 UTC.',
    };
    const api = await givenTheApi(limit);

    await expect(heard(methodFor(api.url).answer(conversation))).rejects.toBeInstanceOf(
      ConversationPausedError,
    );
    await expect(methodFor(api.url).summarise(conversation)).rejects.toBeInstanceOf(
      ConversationPausedError,
    );
  });

  it('reports anything else as unavailable, and never with the key in it', async () => {
    for (const refusal of [
      { status: 401, type: 'authentication_error', message: 'invalid x-api-key' },
      { status: 400, type: 'invalid_request_error', message: 'messages: field required' },
      { status: 529, type: 'overloaded_error', message: 'Overloaded' },
    ]) {
      const api = await givenTheApi(refusal);
      const failure = await heard(methodFor(api.url).answer(conversation)).catch((error) => error);
      expect(failure).toBeInstanceOf(ConversationUnavailableError);
      expect(String(failure.message)).not.toContain(KEY);
      await new Promise((resolve) => server?.close(resolve));
      server = undefined;
    }
  });
});

describe('the documents the conversation is given', () => {
  it('are the glossary, the spec and every ADR, in the same order each time', () => {
    const documents = readBundledDocuments();
    const paths = documents.map((document) => document.path);

    expect(paths.slice(0, 2)).toEqual(['GLOSSARY.md', 'docs/spec.md']);
    expect(paths.slice(2).every((path) => /^docs\/adr\/\d{4}-.+\.md$/.test(path))).toBe(true);
    expect(paths).toContain('docs/adr/0012-non-production-is-the-default.md');
    expect([...paths.slice(2)].sort()).toEqual(paths.slice(2));
    expect(documents.find((document) => document.path === 'GLOSSARY.md')?.text).toContain(
      '**Proposal**',
    );
  });

  it('are refused where the image was built without them', () => {
    expect(() => readBundledDocuments(new URL('file:///nowhere/at/all/'))).toThrow();
  });
});
