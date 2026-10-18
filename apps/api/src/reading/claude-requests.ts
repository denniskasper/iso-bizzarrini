import sharp from 'sharp';
import { z } from 'zod';
import type { NumberCrop } from './find-numbers.js';
import { TABLE_LAYOUTS, type NumberReading } from './reading-method.js';
import { TERM_LIST } from './translation.js';

/**
 * **What Claude is asked, whichever credential it is reached with** (ADR 0016). The API key and
 * the subscription login send the same instructions, the same images and the same schema to the
 * same model, so a Tavola read by one is read the way the other would have read it.
 */
export const CLAUDE_MODEL = 'claude-opus-5-5';

/** The ceiling on every answer, and so the most any one request can cost. */
export const MAX_TOKENS = 16000;

/**
 * What an answer is expected to take, thinking included, since it cannot be counted before it is
 * written. Generous on purpose: the identity is a few lines, a Table sheet's rows rarely pass a
 * few thousand tokens. The cost record shows what each request really took.
 */
export const EXPECTED_OUTPUT = { identify: 1000, reading: 8000, translation: 2000, numbers: 2000 };

/**
 * What one Table sheet's Italian is expected to add to a translation request, before its rows
 * are known: a hundred short names and notes.
 */
export const EXPECTED_TRANSLATION_INPUT = 2000;

export type Effort = 'low' | 'high';

export class ReadingMethodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReadingMethodError';
  }
}

export const identitySchema = z.object({
  kind: z.enum(['drawing', 'table', 'other']),
  tavola: z.string().nullable(),
  foglio: z.string().nullable(),
  turn: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  titleIt: z.string().nullable(),
  sezione: z.string().nullable(),
  gruppo: z.string().nullable(),
  sottogruppo: z.string().nullable(),
});

export const tableSchema = z.object({
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

export const IDENTIFY = `You are looking at one scanned page of a 1960s Italian factory parts catalogue.

Say what the page is:
- "drawing": an exploded-view drawing with position numbers on it.
- "table": a typed table of parts — columns such as Figura / N° Ordinazione / N° Pezzi / Denominazione / Note, or Disegno Origine / Pos / Denominazione / Quant. / Disegno Dal–Al / Note.
- "other": anything else — a cover, an index, technical data.

Give the Tavola N° and Foglio N° exactly as printed, or null where you cannot read them with confidence. Never guess a Tavola number: a sheet with no readable number is set aside for a person.

Give "turn": how many degrees the page must be turned clockwise (0, 90, 180 or 270) for its printed headings and title block to read upright. Decide by the headings only — position numbers on a drawing run in several directions and must not decide it.

Give the title of the Tavola and the Sezione, Gruppo and Sottogruppo as printed, or null.`;

export const READ_TABLE = `You are transcribing one scanned table sheet of a 1960s Italian factory parts catalogue. It has been cut into overlapping horizontal strips, top to bottom; a row near a cut appears on two strips and must be reported once.

Transcribe what is printed. Never repair, complete or guess: where a character could be two things, give your best reading and name the field in "unsure". A wrong number stated confidently is the worst possible outcome; an honest "unsure" costs nothing.

Two layouts exist:
- "catalogue": columns Figura N°, N° Ordinazione, N° Pezzi, Denominazione, Note. "ranges" is empty, and each row has one entry in "numbers" with an empty "range".
- "ufficio-tecnico": columns Disegno Origine, Pos, Denominazione, Quant., then several Disegno Dal/Al columns each headed by a range (e.g. "Dal 1 Al 500", "1a SERIE"), then Note. "ranges" lists those headings left to right, verbatim. Each row has one entry in "numbers" per Dal/Al column that holds a number, with that column's heading as "range". A name may wrap onto a second line: that is one row, not two.

For "position" give what is printed: a number, a range such as 16-17, "-" where the column holds a dash, or "" where it is empty. Do not work out what a dash means.

Rows in printed order. Skip form lines that are entirely empty; keep a row that has a position and nothing else. Keep the Italian exactly as printed, upper case kept. Do not translate.`;

export const numbersSchema = z.object({
  numbers: z.array(
    z.object({
      id: z.number().int(),
      number: z.string().nullable(),
      partial: z.boolean(),
      unsure: z.boolean(),
    }),
  ),
});

export const READ_NUMBERS = `Each image above is a small crop from one exploded-view drawing in a 1960s Italian factory parts catalogue, and the text before it is its id. A red box in each crop surrounds one candidate. Some candidates are printed position numbers (1 to 3 digits); the rest are bits of drawing — a bolt, a washer, a leader line, a letter.

For every id, say what the red box holds: "number" as printed, digits only, or null when it is not a position number.

Read only what is inside the red box. Where a digit just outside it shows the box caught part of a longer number, give the part inside and set "partial". Where you cannot tell (6 or 8, 1 or a line), give your best reading and set "unsure".

Answer for every id, once each.`;

/** Each crop's id, as the text the model reads just before the crop. */
export function numberLabels(crops: NumberCrop[]): string[] {
  return crops.map((crop) => `#${crop.id}`);
}

/** What the model answered, for every crop it was shown: one it left out was read as nothing. */
export function numberReadingsOf(
  crops: NumberCrop[],
  answer: z.infer<typeof numbersSchema>,
): NumberReading[] {
  const byId = new Map(answer.numbers.map((reading) => [reading.id, reading]));
  return crops.map(
    (crop) => byId.get(crop.id) ?? { id: crop.id, number: null, partial: false, unsure: false },
  );
}

export const translationSchema = z.object({ english: z.array(z.string()) });

/** The texts go last, as JSON, so nothing in them can be taken for an instruction. */
export function translateInstruction(texts: string[]): string {
  const terms = TERM_LIST.map((term) => `${term.italian}: ${term.english}`).join('\n');
  return `You are translating text from a 1960s Italian factory parts catalogue into English, as a parts counter would say it.

Answer with "english": one translation for each text, in the same order, and exactly as many as there are texts. Names are in sentence case ("Hexagon head screw"), never upper case.

Every {{1}}, {{2}}… stands for a code or a number printed in the catalogue. Carry each one into the English exactly once, unchanged; never add, drop, translate or reorder the characters inside the braces.

Always translate these words, and their other forms (feminine, plural), the same way:
${terms}

The texts:
${JSON.stringify(texts)}`;
}

/**
 * A Table sheet cut into overlapping strips across its full width, so the model reads it at the
 * scan's own resolution rather than a whole page shrunk to fit. The overlap is what keeps a row
 * on a cut from being lost; the instruction says to report it once.
 */
export async function stripsOf(image: Buffer): Promise<Buffer[]> {
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
