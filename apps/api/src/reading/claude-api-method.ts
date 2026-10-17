import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import {
  CLAUDE_MODEL,
  EXPECTED_OUTPUT,
  IDENTIFY,
  MAX_TOKENS,
  READ_TABLE,
  ReadingMethodError,
  identitySchema,
  stripsOf,
  tableSchema,
  type Effort,
} from './claude-requests.js';
import type {
  Answer,
  ReadingMethod,
  SheetEstimate,
  SheetIdentity,
  SheetImage,
  TableReading,
} from './reading-method.js';

/**
 * **Claude, reached with an API key** — the Reading method that is billed per use and runs
 * unattended (ADR 0016).
 *
 * The key comes from the caller, who reads it from the environment, and it goes nowhere but the
 * request header: not into the method's name, not into an error, not into anything written.
 *
 * There is deliberately **no fallback to another model**. A sheet read by a different model than
 * the one the Tavola records would make that record untrue, and the record is how a Tavola read
 * by a method that proves bad is found again. A refusal stops the run and says so.
 */
export interface ClaudeApiOptions {
  apiKey: string;
  /** Only for a test standing in for the API. */
  baseURL?: string;
  maxRetries?: number;
}

export function createClaudeApiReadingMethod(options: ClaudeApiOptions): ReadingMethod {
  const client = new Anthropic({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    maxRetries: options.maxRetries ?? 2,
  });

  function requestFor<Schema extends z.ZodType>(
    schema: Schema,
    instruction: string,
    images: Buffer[],
    effort: Effort,
  ) {
    return {
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort, format: zodOutputFormat(schema) },
      messages: [
        {
          role: 'user' as const,
          content: [
            ...images.map((image) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: 'image/png' as const,
                data: image.toString('base64'),
              },
            })),
            { type: 'text' as const, text: instruction },
          ],
        },
      ],
    };
  }

  async function ask<Schema extends z.ZodType>(
    schema: Schema,
    instruction: string,
    images: Buffer[],
    effort: Effort,
  ): Promise<Answer<z.infer<Schema>>> {
    const request = requestFor(schema, instruction, images, effort);
    let response;
    try {
      response = await client.messages.parse(request);
    } catch (error) {
      throw new ReadingMethodError(describe(error));
    }

    if (response.stop_reason === 'refusal') {
      throw new ReadingMethodError('The model declined to read this sheet.');
    }
    if (response.stop_reason === 'max_tokens' || response.parsed_output === null) {
      throw new ReadingMethodError('The model’s answer was cut short or could not be read.');
    }

    return {
      value: response.parsed_output,
      tokens: {
        input:
          response.usage.input_tokens +
          (response.usage.cache_creation_input_tokens ?? 0) +
          (response.usage.cache_read_input_tokens ?? 0),
        output: response.usage.output_tokens,
      },
    };
  }

  /** The free token-counting endpoint, given the request exactly as it would be sent. */
  async function counted(request: ReturnType<typeof requestFor<z.ZodType>>): Promise<number> {
    try {
      const { model, messages, output_config } = request;
      return (await client.messages.countTokens({ model, messages, output_config })).input_tokens;
    } catch (error) {
      throw new ReadingMethodError(describe(error));
    }
  }

  return {
    name: `Claude (${CLAUDE_MODEL}) with an API key`,
    model: CLAUDE_MODEL,
    charged: true,

    async estimate(sheet: SheetImage): Promise<SheetEstimate> {
      const [identify, reading] = await Promise.all([
        counted(requestFor(identitySchema, IDENTIFY, [sheet.image], 'low')),
        counted(requestFor(tableSchema, READ_TABLE, await stripsOf(sheet.image), 'high')),
      ]);
      return {
        identify: { input: identify, output: EXPECTED_OUTPUT.identify, outputAtMost: MAX_TOKENS },
        reading: { input: reading, output: EXPECTED_OUTPUT.reading, outputAtMost: MAX_TOKENS },
      };
    },

    async identify(sheet: SheetImage): Promise<Answer<SheetIdentity>> {
      return ask(identitySchema, IDENTIFY, [sheet.image], 'low');
    },

    async readTable(sheet: SheetImage): Promise<Answer<TableReading>> {
      return ask(tableSchema, READ_TABLE, await stripsOf(sheet.image), 'high');
    },
  };
}

/** What went wrong, in words that never carry the request — and so never the key. */
function describe(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'The API key was refused. Check ANTHROPIC_API_KEY.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'The API is limiting requests. Wait, then run the command again.';
  }
  if (error instanceof Anthropic.APIError && error.status !== undefined) {
    return `The API answered ${error.status}.`;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'The API could not be reached.';
  }
  return 'The request to the API failed.';
}
