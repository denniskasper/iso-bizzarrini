import sharp from 'sharp';
import { z } from 'zod';
import { TABLE_LAYOUTS } from './reading-method.js';

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
export const EXPECTED_OUTPUT = { identify: 1000, reading: 8000 };

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
