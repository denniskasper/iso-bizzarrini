import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  createClaudeSubscriptionReadingMethod,
  subscriptionLoginAvailable,
  type ClaudeCli,
} from '../src/reading/claude-subscription-method.js';
import { UsageLimitReached } from '../src/reading/reading-method.js';

/**
 * **The request the subscription Reading method makes of Claude Code** (issue #38), checked
 * against a stand-in for `claude`. What is asserted is what it would be started with, that no API
 * credential reaches it, and what is made of what it prints. One thin test at the end asks the
 * real thing, and only where a login is present.
 */
describe('reading with Claude through a subscription login', () => {
  const KEY = 'sk-ant-test-0000-not-a-real-key';
  const ENV = { PATH: '/usr/bin', HOME: '/home/someone', ANTHROPIC_API_KEY: KEY };

  interface Started {
    args: string[];
    input: string;
    env: NodeJS.ProcessEnv;
  }

  function givenClaudeCode(...printed: unknown[]): { cli: ClaudeCli; started: Started[] } {
    const started: Started[] = [];
    return {
      started,
      cli: async (args, { input, env }) => {
        started.push({ args, input, env });
        return {
          code: 0,
          stdout: printed.map((line) => JSON.stringify(line)).join('\n'),
          stderr: '',
        };
      },
    };
  }

  const init = { type: 'system', subtype: 'init', apiKeySource: 'none', model: 'claude-opus-5-5' };
  const answered = (value: unknown, fields: Record<string, unknown> = {}) => ({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: '',
    structured_output: value,
    usage: {
      input_tokens: 1200,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 100,
      output_tokens: 300,
    },
    ...fields,
  });
  const failed = (said: string, fields: Record<string, unknown> = {}) => ({
    type: 'result',
    subtype: 'success',
    is_error: true,
    result: said,
    ...fields,
  });

  const identity = {
    kind: 'drawing',
    tavola: '84',
    foglio: null,
    turn: 90,
    numbersTurn: 0,
    titleIt: 'ASSALE POSTERIORE',
    sezione: null,
    gruppo: null,
    sottogruppo: null,
  };

  const aPage = async (height: number) => ({
    page: 1,
    image: await sharp({
      create: { width: 1600, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer(),
  });

  it('asks Claude Code with the image, the schema and the model, and counts the tokens', async () => {
    const claude = givenClaudeCode(init, answered(identity));
    const method = createClaudeSubscriptionReadingMethod({ cli: claude.cli, env: ENV });

    const answer = await method.identify(await aPage(1100));

    expect(answer).toEqual({ value: identity, tokens: { input: 1500, output: 300 } });
    const [started] = claude.started;
    const after = (flag: string) => started?.args[started.args.indexOf(flag) + 1];
    expect(started?.args[0]).toBe('-p');
    expect(after('--model')).toBe('claude-opus-5-5');
    expect(after('--effort')).toBe('low');
    expect(after('--tools')).toBe('');
    expect(JSON.parse(after('--json-schema') ?? '').properties.turn).toBeDefined();
    const message = JSON.parse(started?.input ?? '');
    expect(message.message.content.map((block: { type: string }) => block.type)).toEqual([
      'image',
      'text',
    ]);
  });

  it('never hands Claude Code the API key, so the key cannot pay for the run', async () => {
    const claude = givenClaudeCode(init, answered(identity));
    const method = createClaudeSubscriptionReadingMethod({
      cli: claude.cli,
      env: { ...ENV, ANTHROPIC_AUTH_TOKEN: 'a-token', CLAUDE_CODE_USE_BEDROCK: '1' },
    });

    await method.identify(await aPage(800));

    const { env } = claude.started[0] as Started;
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined();
    expect(env.HOME).toBe('/home/someone');
    expect(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBe('16000');
  });

  it('refuses an answer Claude Code got with a key from somewhere else', async () => {
    const claude = givenClaudeCode({ ...init, apiKeySource: 'user' }, answered(identity));
    const method = createClaudeSubscriptionReadingMethod({ cli: claude.cli, env: ENV });

    await expect(method.identify(await aPage(800))).rejects.toThrow(
      /about to read with an API key, not the subscription login/,
    );
  });

  it('sends a Table sheet as overlapping strips, at high effort', async () => {
    const claude = givenClaudeCode(init, answered({ layout: 'catalogue', ranges: [], rows: [] }));
    const method = createClaudeSubscriptionReadingMethod({ cli: claude.cli, env: ENV });

    await method.readTable(await aPage(1700), 1);

    const { args, input } = claude.started[0] as Started;
    expect(args[args.indexOf('--effort') + 1]).toBe('high');
    const blocks = JSON.parse(input).message.content as { type: string }[];
    expect(blocks.filter((block) => block.type === 'image')).toHaveLength(3);
  });

  it('shows each crop of a drawing labelled by its id, as the API-key method does', async () => {
    const claude = givenClaudeCode(
      init,
      answered({ numbers: [{ id: 3, number: '57', partial: false, unsure: false }] }),
    );
    const method = createClaudeSubscriptionReadingMethod({ cli: claude.cli, env: ENV });
    const crop = (await aPage(120)).image;

    const answer = await method.readNumbers([
      { id: 3, image: crop, at: { x: 40, y: 50, w: 31, h: 26 } },
    ]);

    expect(answer.value).toEqual([{ id: 3, number: '57', partial: false, unsure: false }]);
    const blocks = JSON.parse((claude.started[0] as Started).input).message.content as {
      type: string;
      text?: string;
    }[];
    expect(blocks.map((block) => block.text ?? block.type)).toEqual([
      '#3',
      'image',
      expect.stringContaining('red box'),
    ]);
  });

  it('reads an answer that came back as text rather than structured', async () => {
    const claude = givenClaudeCode(
      init,
      answered(undefined, { result: `\`\`\`json\n${JSON.stringify(identity)}\n\`\`\`` }),
    );
    const method = createClaudeSubscriptionReadingMethod({ cli: claude.cli, env: ENV });

    expect((await method.identify(await aPage(800))).value).toEqual(identity);
  });

  it('says the plan’s usage limit was reached, so the run can stop cleanly', async () => {
    const claude = givenClaudeCode(init, failed('Claude AI usage limit reached|1760745600'));
    const method = createClaudeSubscriptionReadingMethod({ cli: claude.cli, env: ENV });

    const failure = await method.identify(await aPage(800)).catch((error: Error) => error);

    expect(failure).toBeInstanceOf(UsageLimitReached);
    expect((failure as Error).message).toBe(
      'The subscription’s usage limit was reached: Claude AI usage limit reached|1760745600',
    );
  });

  it('treats any other failure as a failure, not a limit', async () => {
    const claude = givenClaudeCode(init, failed('Not logged in · Please run /login'));
    const method = createClaudeSubscriptionReadingMethod({ cli: claude.cli, env: ENV });

    const failure = await method.identify(await aPage(800)).catch((error: Error) => error);

    expect(failure).not.toBeInstanceOf(UsageLimitReached);
    expect((failure as Error).message).toBe(
      'Claude Code answered with an error: Not logged in · Please run /login',
    );
  });

  it('estimates a sheet without starting Claude Code, allowing for both turns', async () => {
    const claude = givenClaudeCode();
    const method = createClaudeSubscriptionReadingMethod({ cli: claude.cli, env: ENV });

    const estimate = await method.estimate(await aPage(1700));

    expect(claude.started).toEqual([]);
    expect(estimate.identify.output).toBe(1000);
    expect(estimate.reading.output).toBe(8000);
    expect(estimate.identify.outputAtMost).toBe(32000);
    // The page alone is 1600 × 1700 / 750 tokens, sent twice.
    expect(estimate.identify.input).toBeGreaterThan(2 * Math.ceil((1600 * 1700) / 750));
    expect(estimate.reading.input).toBeGreaterThan(estimate.identify.input);
  });

  it('names itself by the model and the login, and is not charged', () => {
    const method = createClaudeSubscriptionReadingMethod({ env: ENV });
    expect(method.name).toBe('Claude (claude-opus-5-5) with a subscription login');
    expect(method.charged).toBe(false);
  });

  it('finds a subscription login, asking without the API key', async () => {
    const status = (fields: Record<string, unknown>) => givenClaudeCode(fields);

    const subscription = status({ loggedIn: true, authMethod: 'claude.ai' });
    expect(await subscriptionLoginAvailable({ cli: subscription.cli, env: ENV })).toBe(true);
    expect(subscription.started[0]?.args).toEqual(['auth', 'status', '--json']);
    expect(subscription.started[0]?.env.ANTHROPIC_API_KEY).toBeUndefined();

    const key = status({ loggedIn: true, authMethod: 'api_key' });
    expect(await subscriptionLoginAvailable({ cli: key.cli, env: ENV })).toBe(false);
    const none = status({ loggedIn: false, authMethod: 'none' });
    expect(await subscriptionLoginAvailable({ cli: none.cli, env: ENV })).toBe(false);

    const missing: ClaudeCli = async () => {
      throw new Error('spawn claude ENOENT');
    };
    expect(await subscriptionLoginAvailable({ cli: missing, env: ENV })).toBe(false);
  });
});

/**
 * The real request, once, on a blank page — only where Claude Code is signed in with a plan, and
 * so never in CI. It draws a little on that plan.
 */
describe.skipIf(!(await subscriptionLoginAvailable()))('the real subscription login', () => {
  it('answers what a blank page is, and says what it took', async () => {
    const method = createClaudeSubscriptionReadingMethod();
    const image = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();

    const answer = await method.identify({ page: 1, image });

    expect(['drawing', 'table', 'other']).toContain(answer.value.kind);
    expect(answer.tokens.input).toBeGreaterThan(0);
    expect(answer.tokens.output).toBeGreaterThan(0);
  }, 120_000);
});
