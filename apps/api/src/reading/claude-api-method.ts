import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import sharp from 'sharp';
import { z } from 'zod';
import {
  TABLE_LAYOUTS,
  type Answer,
  type ReadingMethod,
  type SheetEstimate,
  type SheetIdentity,
  type SheetImage,
  type TableReading,
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
export const CLAUDE_MODEL = 'claude-opus-5-5';

/** The ceiling on every answer, and so the most any one request can cost. */
const MAX_TOKENS = 16000;

/**
 * What an answer is expected to take, thinking included, since it cannot be counted before it is
 * written. Generous on purpose: the identity is a few lines, a Table sheet's rows rarely pass a
 * few thousand tokens. The cost record shows what each request really took.
 */
const EXPECTED_OUTPUT = { identify: 1000, reading: 8000 };

export interface ClaudeApiOptions {
  apiKey: string;
  /** Only for a test standing in for the API. */
  baseURL?: string;
  maxRetries?: number;
}

export class ReadingMethodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReadingMethodError';
  }
}

const identitySchema = z.object({
  kind: z.enum(['drawing', 'table', 'other']),
  tavola: z.string().nullable(),
  foglio: z.string().nullable(),
  turn: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  titleIt: z.string().nullable(),
  sezione: z.string().nullable(),
  gruppo: z.string().nullable(),
  sottogruppo: z.string().nullable(),
});

const tableSchema = z.object({
  layout: z.enum(TABLE_LAYOUTS),
  ranges: z.array(z.string()),
  rows: z.array(
    z.object({
      position: z.string(),
      disegnoOrigine: z.string(),
      numbers: z.array(z.object({ number: z.string(), range: z.string() })),
      quantity: z.string(),
      nameIt: z.string(),
      note: z.string(),
      unsure: z.array(z.enum(['position', 'numbers', 'quantity'])),
    }),
  ),
});

const IDENTIFY = `You are looking at one scanned page of a 1960s Italian factory parts catalogue.

Say what the page is:
- "drawing": an exploded-view drawing with position numbers on it.
- "table": a typed table of parts — columns such as Figura / N° Ordinazione / N° Pezzi / Denominazione / Note, or Disegno Origine / Pos / Denominazione / Quant. / Disegno Dal–Al / Note.
- "other": anything else — a cover, an index, technical data.

Give the Tavola N° and Foglio N° exactly as printed, or null where you cannot read them with confidence. Never guess a Tavola number: a sheet with no readable number is set aside for a person.

Give "turn": how many degrees the page must be turned clockwise (0, 90, 180 or 270) for its printed headings and title block to read upright. Decide by the headings only — position numbers on a drawing run in several directions and must not decide it.

Give the title of the Tavola and the Sezione, Gruppo and Sottogruppo as printed, or null.`;

const READ_TABLE = `You are transcribing one scanned table sheet of a 1960s Italian factory parts catalogue. It has been cut into overlapping horizontal strips, top to bottom; a row near a cut appears on two strips and must be reported once.

Transcribe what is printed. Never repair, complete or guess: where a character could be two things, give your best reading and name the field in "unsure". A wrong number stated confidently is the worst possible outcome; an honest "unsure" costs nothing.

Two layouts exist:
- "catalogue": columns Figura N°, N° Ordinazione, N° Pezzi, Denominazione, Note. "ranges" is empty, and each row has one entry in "numbers" with an empty "range".
- "ufficio-tecnico": columns Disegno Origine, Pos, Denominazione, Quant., then several Disegno Dal/Al columns each headed by a range (e.g. "Dal 1 Al 500", "1a SERIE"), then Note. "ranges" lists those headings left to right, verbatim. Each row has one entry in "numbers" per Dal/Al column that holds a number, with that column's heading as "range". A name may wrap onto a second line: that is one row, not two.

For "position" give what is printed: a number, a range such as 16-17, "-" where the column holds a dash, or "" where it is empty. Do not work out what a dash means.

Rows in printed order. Skip form lines that are entirely empty; keep a row that has a position and nothing else. Keep the Italian exactly as printed, upper case kept. Do not translate.`;

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
    effort: 'low' | 'high',
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
    effort: 'low' | 'high',
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

/**
 * A Table sheet cut into overlapping strips across its full width, so the model reads it at the
 * scan's own resolution rather than a whole page shrunk to fit. The overlap is what keeps a row
 * on a cut from being lost; the instruction says to report it once.
 */
async function stripsOf(image: Buffer): Promise<Buffer[]> {
  const STEP = 560;
  const TALL = 680;
  const { width = 0, height = 0 } = await sharp(image).metadata();
  const strips: Buffer[] = [];

  for (let top = 0; top === 0 || top < height - 120; top += STEP) {
    const tall = Math.min(TALL, height - top);
    strips.push(
      await sharp(image)
        .extract({ left: 0, top, width, height: tall })
        .resize({ width: 2000, withoutEnlargement: true })
        .png()
        .toBuffer(),
    );
    if (top + tall >= height) {
      break;
    }
  }
  return strips;
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
