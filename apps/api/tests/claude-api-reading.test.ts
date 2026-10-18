import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { createClaudeApiReadingMethod } from '../src/reading/claude-api-method.js';
import { CLAUDE_MODEL } from '../src/reading/claude-requests.js';

/**
 * **The request the API-key Reading method builds** (issue #31), checked against a stand-in for
 * the API on this machine. No test calls a real model, and none needs a key: what is asserted is
 * the shape of what would be sent, what is made of the answer, and that the key never comes back
 * out in an error.
 */
describe('reading with Claude through an API key', () => {
  const KEY = 'sk-ant-test-0000-not-a-real-key';
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
    server = undefined;
  });

  interface Received {
    url: string;
    headers: IncomingHttpHeaders;
    body: {
      model: string;
      output_config: { effort: string; format: { type: string; schema: unknown } };
      messages: { content: { type: string; source?: { media_type: string } }[] }[];
    };
  }

  async function givenTheApi(
    status: number,
    answer: unknown,
  ): Promise<{ url: string; received: Received[] }> {
    const received: Received[] = [];
    server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        received.push({ url: request.url ?? '', headers: request.headers, body: JSON.parse(body) });
        response.writeHead(status, { 'content-type': 'application/json' });
        if (status === 200 && request.url?.startsWith('/v1/messages/count_tokens')) {
          const images = JSON.parse(body).messages[0].content.filter(
            (block: { type: string }) => block.type === 'image',
          );
          response.end(JSON.stringify({ input_tokens: 1000 * images.length + 400 }));
          return;
        }
        response.end(
          JSON.stringify(
            status === 200
              ? {
                  id: 'msg_1',
                  type: 'message',
                  role: 'assistant',
                  model: CLAUDE_MODEL,
                  content: [{ type: 'text', text: JSON.stringify(answer) }],
                  stop_reason: 'end_turn',
                  stop_sequence: null,
                  usage: { input_tokens: 1500, output_tokens: 300 },
                }
              : {
                  type: 'error',
                  error: { type: 'authentication_error', message: 'invalid x-api-key' },
                },
          ),
        );
      });
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return { url: `http://127.0.0.1:${port}`, received };
  }

  const aPage = async (height: number) => ({
    page: 1,
    image: await sharp({
      create: { width: 1600, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer(),
  });

  it('asks for a sheet’s identity with the image and a schema, and counts the tokens', async () => {
    const identity = {
      kind: 'drawing',
      tavola: '84',
      foglio: null,
      turn: 90,
      titleIt: 'ASSALE POSTERIORE',
      sezione: null,
      gruppo: null,
      sottogruppo: null,
    };
    const api = await givenTheApi(200, identity);
    const method = createClaudeApiReadingMethod({ apiKey: KEY, baseURL: api.url, maxRetries: 0 });

    const answer = await method.identify(await aPage(1100));

    expect(answer).toEqual({ value: identity, tokens: { input: 1500, output: 300 } });
    const [request] = api.received;
    expect(request?.headers['x-api-key']).toBe(KEY);
    expect(request?.body.model).toBe('claude-opus-5-5');
    expect(request?.body.output_config.format.type).toBe('json_schema');
    expect(request?.body.messages[0]?.content.map((block) => block.type)).toEqual([
      'image',
      'text',
    ]);
  });

  it('sends a Table sheet as overlapping strips at its own resolution', async () => {
    const api = await givenTheApi(200, { layout: 'catalogue', ranges: [], rows: [] });
    const method = createClaudeApiReadingMethod({ apiKey: KEY, baseURL: api.url, maxRetries: 0 });

    await method.readTable(await aPage(1700), 1);

    const blocks = api.received[0]?.body.messages[0]?.content ?? [];
    expect(blocks.filter((block) => block.type === 'image')).toHaveLength(3);
    expect(api.received[0]?.body.output_config.effort).toBe('high');
  });

  it('estimates a sheet by counting the requests it would send, without sending them', async () => {
    const api = await givenTheApi(200, null);
    const method = createClaudeApiReadingMethod({ apiKey: KEY, baseURL: api.url, maxRetries: 0 });

    const estimate = await method.estimate(await aPage(1700));

    // One image to identify it; three strips to read it; the translation's instruction, and an
    // allowance for the Italian a sheet holds.
    expect(estimate).toEqual({
      identify: { input: 1400, output: 1000, outputAtMost: 16000 },
      reading: { input: 3400, output: 8000, outputAtMost: 16000 },
      translation: { input: 2400, output: 2000, outputAtMost: 16000 },
    });
    expect(api.received.map((request) => request.url)).toEqual([
      '/v1/messages/count_tokens',
      '/v1/messages/count_tokens',
      '/v1/messages/count_tokens',
    ]);
    expect(api.received.map((request) => request.body.output_config.effort).sort()).toEqual([
      'high',
      'low',
      'low',
    ]);
    expect(api.received[0]?.body.model).toBe('claude-opus-5-5');
    expect(api.received[0]?.body.output_config.format.type).toBe('json_schema');
    expect(method.model).toBe(CLAUDE_MODEL);
  });

  it('translates with the term list and the texts, and no image', async () => {
    const api = await givenTheApi(200, { english: ['Screw', 'RIV {{1}} mounting'] });
    const method = createClaudeApiReadingMethod({ apiKey: KEY, baseURL: api.url, maxRetries: 0 });

    const answer = await method.translate(['VITE', 'RIV {{1}} ATTACCO']);

    expect(answer).toEqual({
      value: ['Screw', 'RIV {{1}} mounting'],
      tokens: { input: 1500, output: 300 },
    });
    const blocks = api.received[0]?.body.messages[0]?.content ?? [];
    expect(blocks.map((block) => block.type)).toEqual(['text']);
    const instruction = (blocks[0] as unknown as { text: string }).text;
    expect(instruction).toContain('vite: screw');
    expect(instruction).toContain('rosetta: washer');
    expect(instruction).toContain('["VITE","RIV {{1}} ATTACCO"]');
    expect(api.received[0]?.body.output_config.format.type).toBe('json_schema');
  });

  it('shows each crop of a drawing labelled by its id, and never where it was cut from', async () => {
    const api = await givenTheApi(200, {
      numbers: [{ id: 7, number: '12', partial: false, unsure: true }],
    });
    const method = createClaudeApiReadingMethod({ apiKey: KEY, baseURL: api.url, maxRetries: 0 });
    const crop = (await aPage(120)).image;

    const answer = await method.readNumbers([
      { id: 7, image: crop, at: { x: 1234, y: 987, w: 31, h: 26 } },
      { id: 8, image: crop, at: { x: 2345, y: 876, w: 14, h: 26 } },
    ]);

    // An id the model said nothing about is read as nothing.
    expect(answer.value).toEqual([
      { id: 7, number: '12', partial: false, unsure: true },
      { id: 8, number: null, partial: false, unsure: false },
    ]);
    const blocks = api.received[0]?.body.messages[0]?.content ?? [];
    expect(blocks.map((block) => block.type)).toEqual(['text', 'image', 'text', 'image', 'text']);
    expect(blocks.map((block) => (block as unknown as { text?: string }).text)).toEqual([
      '#7',
      undefined,
      '#8',
      undefined,
      expect.stringContaining('red box'),
    ]);
    const sent = JSON.stringify(api.received[0]?.body);
    expect(sent).not.toContain('1234');
    expect(sent).not.toContain('2345');
    expect(api.received[0]?.body.output_config.format.type).toBe('json_schema');
  });

  it('names itself by the model and the credential, and never by the key', async () => {
    const method = createClaudeApiReadingMethod({ apiKey: KEY });
    expect(method.name).toBe('Claude (claude-opus-5-5) with an API key');
  });

  it('says a refused key was refused, without repeating it', async () => {
    const api = await givenTheApi(401, null);
    const method = createClaudeApiReadingMethod({ apiKey: KEY, baseURL: api.url, maxRetries: 0 });

    const failure = await method.identify(await aPage(800)).catch((error: Error) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('The API key was refused. Check ANTHROPIC_API_KEY.');
    expect(JSON.stringify(failure)).not.toContain(KEY);
    expect(String((failure as Error).stack)).not.toContain(KEY);
  });
});
