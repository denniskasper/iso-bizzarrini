import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { z } from 'zod';
import {
  CLAUDE_MODEL,
  EXPECTED_OUTPUT,
  EXPECTED_TRANSLATION_INPUT,
  IDENTIFY,
  MAX_TOKENS,
  ORIENTATION_LABELS,
  ORIENT_NUMBERS,
  READ_NUMBERS,
  READ_TABLE,
  ReadingMethodError,
  identitySchema,
  numberLabels,
  numberReadingsOf,
  numbersSchema,
  orientationSchema,
  stripsOf,
  tableSchema,
  translateInstruction,
  translationSchema,
  type Effort,
} from './claude-requests.js';
import {
  UsageLimitReached,
  type Answer,
  type NumberCrop,
  type NumberReading,
  type NumbersBothWays,
  type ReadingMethod,
  type RequestEstimate,
  type SheetIdentity,
  type SheetImage,
  type TableReading,
} from './reading-method.js';

/**
 * **Claude, reached with a subscription login** — the Reading method that is not billed per use,
 * and draws on the plan's limits instead (ADR 0017, issue #38).
 *
 * It runs Claude Code headless (`claude -p`), signed in with the plan, and asks exactly what the
 * API-key method asks: the same model, instructions, images and schema. Claude Code would rather
 * read with an API key where it finds one, so **every credential that is not the login is taken
 * out of its environment**, and a run that still reports a key as its source is refused rather
 * than read. A set key never pays for a run meant for the subscription.
 *
 * Reaching the plan's usage limit is `UsageLimitReached`, which stops the run cleanly.
 */
export interface ClaudeCliRun {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs `claude` with these arguments, this standard input and this environment. */
export type ClaudeCli = (
  args: string[],
  options: { input: string; env: NodeJS.ProcessEnv },
) => Promise<ClaudeCliRun>;

export interface ClaudeSubscriptionOptions {
  /** Claude Code itself, unless a test stands in for it. */
  cli?: ClaudeCli;
  /** The environment it is started from; the API credentials in it are removed. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Everything in the environment that would make Claude Code read with something other than the
 * login: an API key, a bearer token, or a cloud provider billed per use. `CLAUDECODE` goes too, so
 * the command can be started from within a Claude Code session.
 */
const NOT_THE_LOGIN = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDECODE',
];

export function subscriptionEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const kept = { ...env };
  for (const name of NOT_THE_LOGIN) {
    delete kept[name];
  }
  // `claude -p` takes no max_tokens; this is its ceiling on every answer.
  kept.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(MAX_TOKENS);
  return kept;
}

/** Whether Claude Code is signed in with a plan, asked with every API credential taken away. */
export async function subscriptionLoginAvailable(
  options: ClaudeSubscriptionOptions = {},
): Promise<boolean> {
  const cli = options.cli ?? claudeCli();
  try {
    const run = await cli(['auth', 'status', '--json'], {
      input: '',
      env: subscriptionEnvironment(options.env ?? process.env),
    });
    const status = JSON.parse(run.stdout) as { loggedIn?: unknown; authMethod?: unknown };
    return status.loggedIn === true && !/api.?key/i.test(String(status.authMethod ?? ''));
  } catch {
    return false;
  }
}

/**
 * The structured answer comes back as a tool call, and Claude Code then asks the model once more
 * to finish its turn, so every request is sent twice. The estimate allows for both.
 */
const TURNS = 2;

/** What Claude Code adds to a request around the instruction and images, with its own prompt replaced. */
const FRAMING_TOKENS = 3000;

const SYSTEM_PROMPT =
  'You read scanned sheets of a parts catalogue, and answer only in the structure you are given.';

export function createClaudeSubscriptionReadingMethod(
  options: ClaudeSubscriptionOptions = {},
): ReadingMethod {
  const cli = options.cli ?? claudeCli();
  const env = subscriptionEnvironment(options.env ?? process.env);

  async function ask<Schema extends z.ZodType>(
    schema: Schema,
    instruction: string,
    images: Buffer[],
    effort: Effort,
    labels: string[] = [],
  ): Promise<Answer<z.infer<Schema>>> {
    const message = {
      type: 'user',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: [
          ...images.flatMap((image, index) => [
            ...(labels[index] ? [{ type: 'text', text: labels[index] }] : []),
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: image.toString('base64') },
            },
          ]),
          { type: 'text', text: instruction },
        ],
      },
    };

    let run: ClaudeCliRun;
    try {
      run = await cli(
        [
          '-p',
          '--model',
          CLAUDE_MODEL,
          '--effort',
          effort,
          '--system-prompt',
          SYSTEM_PROMPT,
          '--json-schema',
          JSON.stringify(z.toJSONSchema(schema, { target: 'draft-7' })),
          '--tools',
          '',
          '--safe-mode',
          '--no-session-persistence',
          '--input-format',
          'stream-json',
          '--output-format',
          'stream-json',
          '--verbose',
        ],
        { input: `${JSON.stringify(message)}\n`, env },
      );
    } catch {
      throw new ReadingMethodError(
        'Claude Code could not be started. Is `claude` installed, and signed in with `claude auth login`?',
      );
    }

    const lines = messagesOf(run.stdout);
    const init = lines.find((line) => line.type === 'system' && line.subtype === 'init');
    if (init && typeof init.apiKeySource === 'string' && init.apiKeySource !== 'none') {
      throw new ReadingMethodError(
        'Claude Code was about to read with an API key, not the subscription login, so nothing ' +
          'was read with it. Remove the key from its settings, or read with --with api-key.',
      );
    }

    const result = lines.findLast((line) => line.type === 'result');
    if (!result) {
      throw new ReadingMethodError(
        `Claude Code ended without an answer${run.code ? ` (exit ${run.code})` : ''}: ` +
          `${firstLine(run.stderr) || 'it said nothing'}.`,
      );
    }
    if (result.is_error === true || result.subtype !== 'success') {
      const said = firstLine(String(result.result ?? result.subtype ?? ''));
      if (result.api_error_status === 429 || USAGE_LIMIT.test(said)) {
        throw new UsageLimitReached(`The subscription’s usage limit was reached: ${said}`);
      }
      throw new ReadingMethodError(`Claude Code answered with an error: ${said}`);
    }
    if (result.stop_reason === 'refusal') {
      throw new ReadingMethodError('The model declined to read this sheet.');
    }

    const parsed = schema.safeParse(result.structured_output ?? jsonIn(result.result));
    if (!parsed.success) {
      throw new ReadingMethodError('The model’s answer was cut short or could not be read.');
    }

    const usage = (result.usage ?? {}) as Record<string, unknown>;
    const count = (name: string): number => {
      const value = usage[name];
      return typeof value === 'number' ? value : 0;
    };
    return {
      value: parsed.data,
      tokens: {
        input:
          count('input_tokens') +
          count('cache_creation_input_tokens') +
          count('cache_read_input_tokens'),
        output: count('output_tokens'),
      },
    };
  }

  /**
   * Nothing can be counted for free without an API key, so the input is worked out here, from
   * above: an image at its full size (the model only ever shrinks one), the text at three
   * characters a token, Claude Code's framing, and all of it sent twice.
   */
  async function estimated(
    schema: z.ZodType,
    instruction: string,
    images: Buffer[],
    output: number,
    labels: string[] = [],
  ): Promise<RequestEstimate> {
    let input = FRAMING_TOKENS;
    for (const image of images) {
      const { width = 0, height = 0 } = await sharp(image).metadata();
      input += Math.ceil((width * height) / 750);
    }
    const text =
      SYSTEM_PROMPT + instruction + labels.join('') + JSON.stringify(z.toJSONSchema(schema));
    input += Math.ceil(text.length / 3);
    return { input: TURNS * input, output, outputAtMost: TURNS * MAX_TOKENS };
  }

  return {
    name: `Claude (${CLAUDE_MODEL}) with a subscription login`,
    model: CLAUDE_MODEL,
    charged: false,

    async estimate(sheet: SheetImage) {
      return {
        identify: await estimated(
          identitySchema,
          IDENTIFY,
          [sheet.image],
          EXPECTED_OUTPUT.identify,
        ),
        reading: await estimated(
          tableSchema,
          READ_TABLE,
          await stripsOf(sheet.image),
          EXPECTED_OUTPUT.reading,
        ),
        translation: await estimated(
          translationSchema,
          translateInstruction([]),
          [],
          EXPECTED_OUTPUT.translation,
        ).then((request) => ({
          ...request,
          input: request.input + TURNS * EXPECTED_TRANSLATION_INPUT,
        })),
      };
    },

    async estimateTranslation(texts: string[]) {
      return estimated(
        translationSchema,
        translateInstruction(texts),
        [],
        EXPECTED_OUTPUT.translation,
      );
    },

    async identify(sheet: SheetImage): Promise<Answer<SheetIdentity>> {
      return ask(identitySchema, IDENTIFY, [sheet.image], 'low');
    },

    async readTable(sheet: SheetImage): Promise<Answer<TableReading>> {
      return ask(tableSchema, READ_TABLE, await stripsOf(sheet.image), 'high');
    },

    async translate(texts: string[]): Promise<Answer<string[]>> {
      const answer = await ask(translationSchema, translateInstruction(texts), [], 'low');
      return { value: answer.value.english, tokens: answer.tokens };
    },

    async estimateNumbers(crops: NumberCrop[]) {
      return estimated(
        numbersSchema,
        READ_NUMBERS,
        crops.map((crop) => crop.image),
        EXPECTED_OUTPUT.numbers,
        numberLabels(crops),
      );
    },

    async estimateOrientation(rows: NumbersBothWays) {
      return estimated(
        orientationSchema,
        ORIENT_NUMBERS,
        [rows.asFound, rows.halfRound],
        EXPECTED_OUTPUT.orientation,
        ORIENTATION_LABELS,
      );
    },

    async orientNumbers(rows: NumbersBothWays): Promise<Answer<'as-found' | 'half-round'>> {
      const answer = await ask(
        orientationSchema,
        ORIENT_NUMBERS,
        [rows.asFound, rows.halfRound],
        'low',
        ORIENTATION_LABELS,
      );
      return {
        value: answer.value.upright === 'A' ? 'as-found' : 'half-round',
        tokens: answer.tokens,
      };
    },

    async readNumbers(crops: NumberCrop[]): Promise<Answer<NumberReading[]>> {
      const images = crops.map((crop) => crop.image);
      const answer = await ask(numbersSchema, READ_NUMBERS, images, 'low', numberLabels(crops));
      return { value: numberReadingsOf(crops, answer.value), tokens: answer.tokens };
    },
  };
}

/** How Claude Code words a plan that will read no more for now. */
const USAGE_LIMIT = /usage limit|hit your (?:\w+ )?limit|limit reached|out of (?:extra )?usage/i;

type CliMessage = Record<string, unknown>;

/** One JSON object a line; anything else Claude Code prints is not an answer. */
function messagesOf(stdout: string): CliMessage[] {
  const messages: CliMessage[] = [];
  for (const line of stdout.split('\n')) {
    try {
      const value: unknown = JSON.parse(line);
      if (value && typeof value === 'object') {
        messages.push(value as CliMessage);
      }
    } catch {
      // Not a message.
    }
  }
  return messages;
}

/** The answer as text, where it did not come back structured: JSON, perhaps fenced. */
function jsonIn(text: unknown): unknown {
  if (typeof text !== 'string') {
    return undefined;
  }
  try {
    return JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
  } catch {
    return undefined;
  }
}

function firstLine(text: string): string {
  return (text.trim().split('\n')[0] ?? '').slice(0, 200);
}

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
