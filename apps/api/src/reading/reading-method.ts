import type { NumberCrop } from './find-numbers.js';

export type { NumberCrop };

/**
 * **The one seam between the read command and a model** (ADR 0017). A Reading method is given one
 * sheet of the factory's catalog and told what to read from it, and answers with what it read and
 * the tokens that cost. Everything above it — which sheet is whose, what a dash means, where two
 * Readings disagree, the files an Editor opens — is plain code that never talks to a model, and
 * is tested against a fake one.
 *
 * What it is asked for is what is *printed*. It is never asked what a row means: a dash, a
 * repeated number and a range are read as printed and interpreted afterwards, in one place, so
 * that the interpretation is the same whichever method read the sheet.
 */
export interface ReadingMethod {
  /** What a Tavola records it was read by, and what the report names. Never a credential. */
  readonly name: string;
  /** The model it sends to, which is what the price list is looked up by. */
  readonly model: string;
  /**
   * Whether what it reads is billed per use. A subscription login is not: its runs are priced at
   * the same list prices, and the spending limit is held the same way, but they are reported as
   * what the run *would have cost*, not charged.
   */
  readonly charged: boolean;
  /**
   * What this sheet would take to read, worked out **before anything is sent** to be read. The
   * input is counted for the requests exactly as they would go; the answer cannot be counted
   * before it is written, so the method says what it expects one to take and the most it can.
   */
  estimate(sheet: SheetImage): Promise<SheetEstimate>;
  /** What kind of sheet this is, whose, and which way up its headings read. */
  identify(sheet: SheetImage): Promise<Answer<SheetIdentity>>;
  /**
   * The rows of one Table sheet, upright. Called twice per sheet, and each call is a Reading of
   * its own that knows nothing of the other — which is the whole of what a disagreement is worth.
   */
  readTable(sheet: SheetImage, reading: 1 | 2): Promise<Answer<TableReading>>;
  /**
   * English for Italian the factory printed — *Denominazioni*, Notes and titles — in the same
   * order, one for each. Every code and number has been taken out of the Italian first and stands
   * as `{{1}}`, `{{2}}`…, which the English must carry exactly once each, so translation can never
   * alter one (`translation.ts`). The term list keeps one Italian word one English word.
   */
  translate(texts: string[]): Promise<Answer<string[]>>;
  /** What translating these would take, worked out before it is sent, as `estimate` is. */
  estimateTranslation(texts: string[]): Promise<RequestEstimate>;
  /**
   * What each crop of a drawing says: the position number inside its red box, or `null` where the
   * box holds something else. *Where* each crop was cut from is found from the ink and is never
   * sent (`find-numbers.ts`): the model reads, it does not locate. One request holds no more than
   * `NUMBERS_PER_REQUEST` crops.
   */
  readNumbers(crops: NumberCrop[]): Promise<Answer<NumberReading[]>>;
  /** What reading these crops would take, worked out before it is sent, as `estimate` is. */
  estimateNumbers(crops: NumberCrop[]): Promise<RequestEstimate>;
  /**
   * Which of two rows of the same crops shows a drawing's numbers the right way up: as found, or
   * turned half round (issue #72). Asked where the numbers read at a turn from the headings, since
   * which way a sideways number reads is easy to get the wrong way round, and an upside-down 6 is
   * a 9; telling two rows apart is not.
   */
  orientNumbers(rows: NumbersBothWays): Promise<Answer<'as-found' | 'half-round'>>;
  /** What asking it would take, worked out before it is sent, as `estimate` is. */
  estimateOrientation(rows: NumbersBothWays): Promise<RequestEstimate>;
}

/** A few of a drawing's crops in a row as they were found, and the same row turned half round. */
export interface NumbersBothWays {
  /** The page they were cut from. Never sent. */
  page: number;
  /** PNG. */
  asFound: Buffer;
  /** PNG. */
  halfRound: Buffer;
}

/** How many crops of a drawing one request is shown. */
export const NUMBERS_PER_REQUEST = 40;

/** What one crop of a drawing was read as. */
export interface NumberReading {
  id: number;
  /** The number inside the red box as printed, or `null` where it is not a position number. */
  number: string | null;
  /**
   * The box caught part of a longer number — a neighbouring digit shows outside it. Two such parts
   * side by side are one number the finder split, and are put back together.
   */
  partial: boolean;
  /** Read as best it could be: 6 or 8, 1 or a line. */
  unsure: boolean;
}

/**
 * **The plan the method reads on will read no more for now.** Thrown by `identify` or `readTable`
 * when a subscription's usage limit is reached. The read command stops cleanly, as it does at its
 * spending limit, and a later run with `--resume` picks up what was not read.
 */
export class UsageLimitReached extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageLimitReached';
  }
}

/**
 * **The method could not get an answer**: the request failed after the method's own retries, or
 * the model declined it or answered with something that could not be read. Its message is written
 * never to carry a request, and so never a credential. A run stops cleanly on one rather than ask
 * again and pay again (issue #59).
 */
export class ReadingMethodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReadingMethodError';
  }
}

/** One page of the catalog as an image, and where in the PDF it was. */
export interface SheetImage {
  /** The page of the PDF, counting from 1. Provenance only — never which Tavola it belongs to. */
  page: number;
  /** PNG. */
  image: Buffer;
}

export interface Answer<T> {
  value: T;
  tokens: Tokens;
}

export interface Tokens {
  input: number;
  output: number;
}

/**
 * One page's requests. Which kind of sheet a page is is only known once it has been asked, so
 * every page is estimated as though it were a Table sheet, whose two Readings are by far the
 * larger part, and whose rows are then translated.
 */
export interface SheetEstimate {
  identify: RequestEstimate;
  /** One Reading of it as a Table sheet. */
  reading: RequestEstimate;
  /** Translating what a Table sheet holds into English. */
  translation: RequestEstimate;
}

export interface RequestEstimate {
  /** Counted. */
  input: number;
  /** What the answer is expected to take. */
  output: number;
  /** The most the answer can take: the request's own ceiling. */
  outputAtMost: number;
}

export type SheetKind = 'drawing' | 'table' | 'other';

/** A quarter turn, clockwise, in degrees. */
export type Turn = 0 | 90 | 180 | 270;

export interface SheetIdentity {
  kind: SheetKind;
  /** The *Tavola N°* as printed, or `null` where it cannot be read. */
  tavola: string | null;
  /** The *Foglio N°* as printed. Provenance only. */
  foglio: string | null;
  /**
   * How far the sheet has to be turned clockwise for its **headings** to read upright. The
   * position numbers on a drawing run several ways and cannot decide it.
   */
  turn: Turn;
  /**
   * How far a drawing has to be turned clockwise for most of its **position numbers** to read
   * upright, from the page as scanned: often `turn`, but a quarter from it where the numbers are
   * printed sideways to the title block (issue #72). Missing for a page identified before it was
   * asked, which is asked again before its numbers are read.
   */
  numbersTurn?: Turn;
  /** The title of the Tavola as printed, in Italian. */
  titleIt: string | null;
  sezione: string | null;
  gruppo: string | null;
  sottogruppo: string | null;
}

/**
 * - `catalogue`: *Figura / N° Ordinazione / N° Pezzi / Denominazione / Note*
 * - `ufficio-tecnico`: *Disegno Origine / Pos / Denominazione / Quant. / Disegno Dal–Al / Note*
 */
export type TableLayout = 'catalogue' | 'ufficio-tecnico';

export const TABLE_LAYOUTS = ['catalogue', 'ufficio-tecnico'] as const satisfies TableLayout[];

export interface TableReading {
  layout: TableLayout;
  /**
   * The headings of the *Disegno Dal–Al* columns, left to right, verbatim — "Dal 1 Al 500",
   * "1a SERIE". Empty on the catalogue layout, which has one Catalog Number column.
   */
  ranges: string[];
  rows: ReadRow[];
}

/** What a Reading may say it was unsure of, and the only fields a doubt is ever raised over. */
export type UnsureField = 'position' | 'numbers' | 'quantity';

export interface ReadRow {
  /** As printed: `12`, `16-17`, `-`, or `''` where the column is empty. */
  position: string;
  disegnoOrigine: string;
  /**
   * The Catalog Numbers on the row as printed. On the catalogue layout there is one, with an
   * empty `range`; on the other, one per *Dal–Al* column that holds a number, with its heading.
   */
  numbers: { number: string; range: string }[];
  quantity: string;
  /** The *Denominazione*, verbatim, upper case kept. */
  nameIt: string;
  note: string;
  unsure: UnsureField[];
}
