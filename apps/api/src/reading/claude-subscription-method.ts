import type { SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import sharp from 'sharp';
import { z } from 'zod';
import {
  agentQuery,
  machineLoginEnvironment,
  isolatedSessionOptions,
  USAGE_LIMIT,
  type AgentQuery,
} from '../platform/claude-code.js';
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
 * **Claude, reached with the developer's own subscription** — the Reading method that is not
 * billed per use, and draws on the plan's limits instead (ADR 0017, issues #38, #151). It runs
 * only in Development: a server refuses to start with it (`loadConfig`), and its image has no
 * Claude Code.
 *
 * It runs Claude Code through the Claude Agent SDK, on the login already on the machine, and asks
 * exactly what the API-key method asks: the same model, instructions, images and schema. Claude
 * Code would rather read with an API key where it finds one, so **every credential that is not
 * the machine's login is taken out of its environment**, and a run that still reports a key as
 * its source is refused rather than read. A set key never pays for a run meant for the
 * subscription.
 *
 * Reaching the plan's usage limit is `UsageLimitReached`, which stops the run cleanly.
 */
export interface ClaudeSubscriptionOptions {
  /** The Agent SDK's `query`, unless a test stands in for it. */
  query?: AgentQuery;
  /** The environment Claude Code is started from; every credential in it is removed. */
  env?: NodeJS.ProcessEnv;
}

/** The machine's login alone, with Claude Code's ceiling on every answer. */
function readingEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Claude Code takes no max_tokens; this is its ceiling on every answer.
  return { ...machineLoginEnvironment(env), CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(MAX_TOKENS) };
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
  const env = readingEnvironment(options.env ?? process.env);

  async function ask<Schema extends z.ZodType>(
    schema: Schema,
    instruction: string,
    images: Buffer[],
    effort: Effort,
    labels: string[] = [],
  ): Promise<Answer<z.infer<Schema>>> {
    const message: SDKUserMessage = {
      type: 'user',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: [
          ...images.flatMap((image, index) => [
            ...(labels[index] ? [{ type: 'text' as const, text: labels[index] }] : []),
            {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: 'image/png' as const,
                data: image.toString('base64'),
              },
            },
          ]),
          { type: 'text', text: instruction },
        ],
      },
    };
    async function* prompt(): AsyncGenerator<SDKUserMessage> {
      yield message;
    }

    const query = options.query ?? (await agentQuery());
    if (query === null) {
      throw new ReadingMethodError(
        'The Claude Agent SDK is not installed here. It is a development dependency, and the ' +
          'subscription reads only in Development.',
      );
    }

    let result: Extract<SDKMessage, { type: 'result' }> | undefined;
    try {
      for await (const line of query({
        prompt: prompt(),
        options: {
          ...isolatedSessionOptions(env),
          model: CLAUDE_MODEL,
          effort,
          systemPrompt: SYSTEM_PROMPT,
          outputFormat: {
            type: 'json_schema',
            schema: z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>,
          },
        },
      })) {
        if (line.type === 'system' && line.subtype === 'init' && line.apiKeySource !== 'none') {
          throw new ReadingMethodError(
            'Claude Code was about to read with an API key, not this machine’s login, so ' +
              'nothing was read with it. Remove the key from its settings, or read with api-key.',
          );
        }
        if (line.type === 'result') {
          result = line;
        }
      }
    } catch (error) {
      if (error instanceof ReadingMethodError) {
        throw error;
      }
      const said = error instanceof Error ? firstLine(error.message) : '';
      throw new ReadingMethodError(
        'Claude Code could not be started, or stopped without an answer' +
          (said ? ` (${said})` : '') +
          '. Is it signed in on this machine with `claude auth login`?',
      );
    }

    if (!result) {
      throw new ReadingMethodError('Claude Code ended without an answer.');
    }
    if (result.is_error || result.subtype !== 'success') {
      const said = firstLine(result.subtype === 'success' ? result.result : result.subtype);
      if (
        (result.subtype === 'success' && result.api_error_status === 429) ||
        USAGE_LIMIT.test(said)
      ) {
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

    const usage = result.usage as unknown as Record<string, unknown>;
    const count = (name: string): number => {
      const value = usage?.[name];
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
