import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Box } from '../../src/reading/find-numbers.js';
import type { PageSource } from '../../src/reading/read-catalog.js';
import {
  UsageLimitReached,
  type NumberReading,
  type ReadRow,
  type ReadingMethod,
  type RequestEstimate,
  type SheetEstimate,
  type SheetIdentity,
  type TableReading,
  type Tokens,
} from '../../src/reading/reading-method.js';

/**
 * **A catalog, invented, and a Reading method that knows it by heart.**
 *
 * No test calls a model (ADR 0017). The fake answers each page with what the test says is
 * printed on it, and the same fixed token counts every time, so what is asserted is everything
 * above the seam: which sheet went to which Tavola, what the rows were taken to mean, where the
 * two Readings were compared, and what was written for an Editor to open.
 *
 * The pages are blank images of a size each test chooses — the size is what shows a sheet was
 * turned — except for what a test prints on a drawing: position numbers, as digits of ink a
 * finder can find, and ruled boxes. The fake reads a crop as whatever digits are printed inside
 * the box it was cut round, as a model reading only the red box would.
 */
export interface InventedPage {
  identity?: Partial<SheetIdentity>;
  /** The first Reading of a Table sheet, and the second where it differs from the first. */
  readings?: [TableReading, TableReading?];
  width?: number;
  height?: number;
  /**
   * What each request about this page really takes, where it is not the usual. No more than its
   * estimate's ceiling, as no real answer can be.
   */
  tokens?: Tokens;
  estimate?: Partial<SheetEstimate>;
  /** Position numbers printed on the page. */
  numbers?: PrintedNumber[];
  /** Ruled boxes drawn on the page, as a title block's cells are. */
  rules?: Box[];
  /** Ink filling each of these, as a line of the drawing does. */
  lines?: Box[];
}

/** A number printed on a drawing, its first digit's top left corner at `x`, `y`. */
export interface PrintedNumber {
  text: string;
  x: number;
  y: number;
  /** Pixels between its digits: 3 unless a test says, 0 where their ink touches. */
  gap?: number;
  /** The fake hesitates over it. */
  unsure?: boolean;
}

/**
 * At the price list's $4 in and $20 out per million, a request costs $0.04, and the most one
 * could cost is $0.10. Every page is estimated at $0.12: asked what it is, and read twice.
 */
export const TOKENS_PER_CALL: Tokens = { input: 5000, output: 1000 };
export const ESTIMATE_PER_REQUEST: RequestEstimate = {
  input: 5000,
  output: 1000,
  outputAtMost: 4000,
};

/** Translating costs nothing here unless a test says so, so the figures above stay round. */
export const NO_TOKENS: Tokens = { input: 0, output: 0 };
export const NO_ESTIMATE: RequestEstimate = { input: 0, output: 0, outputAtMost: 0 };

export interface FakeMethodOptions {
  /** As though it read on a subscription: priced, but not charged. */
  charged?: boolean;
  /**
   * What it translates each Italian text as, codes masked as `{{1}}`. Anything not here comes
   * back as `[en] ` and the Italian, placeholders and all.
   */
  english?: Record<string, string>;
  /** What each translation request takes, and is estimated to. Nothing, unless a test says. */
  translationTokens?: Tokens;
  translationEstimate?: RequestEstimate;
  /** How many requests it answers before the plan's usage limit is reached. */
  usageLimitAfter?: number;
  /** What each request to read a drawing's numbers takes. As any other request, unless said. */
  numbersTokens?: Tokens;
  numbersEstimate?: RequestEstimate;
}

export function fakeReadingMethod(
  pages: InventedPage[],
  options: FakeMethodOptions = {},
): ReadingMethod & { calls: string[]; estimated: number[]; translated: string[][] } {
  const calls: string[] = [];
  const translated: string[][] = [];
  const estimated: number[] = [];
  const pageOf = (page: number): InventedPage => pages[page - 1] ?? {};
  const call = (what: string) => {
    if (options.usageLimitAfter !== undefined && calls.length >= options.usageLimitAfter) {
      throw new UsageLimitReached('The subscription’s usage limit was reached: resets at 5pm.');
    }
    calls.push(what);
  };

  return {
    name: options.charged === false ? 'a fake subscription' : 'a fake Reading method',
    model: 'claude-opus-5-5',
    charged: options.charged ?? true,
    calls,
    estimated,
    translated,
    async estimate(sheet) {
      estimated.push(sheet.page);
      return {
        identify: ESTIMATE_PER_REQUEST,
        reading: ESTIMATE_PER_REQUEST,
        translation: options.translationEstimate ?? NO_ESTIMATE,
        ...pageOf(sheet.page).estimate,
      };
    },
    async identify(sheet) {
      call(`identify ${sheet.page}`);
      const identity: SheetIdentity = {
        kind: 'other',
        tavola: null,
        foglio: null,
        turn: 0,
        titleIt: null,
        sezione: null,
        gruppo: null,
        sottogruppo: null,
        ...pageOf(sheet.page).identity,
      };
      return { value: identity, tokens: pageOf(sheet.page).tokens ?? TOKENS_PER_CALL };
    },
    async readTable(sheet, reading) {
      call(`read ${sheet.page} ${reading}`);
      const [first, second] = pageOf(sheet.page).readings ?? [aTable([])];
      return {
        value: reading === 2 && second ? second : first,
        tokens: pageOf(sheet.page).tokens ?? TOKENS_PER_CALL,
      };
    },
    async estimateTranslation() {
      return options.translationEstimate ?? NO_ESTIMATE;
    },
    async estimateNumbers() {
      return options.numbersEstimate ?? ESTIMATE_PER_REQUEST;
    },
    async readNumbers(crops) {
      call(`numbers ${crops.length}`);
      const printed = pages.flatMap((page) => page.numbers ?? []);
      return {
        value: crops.map((crop) => readCrop(crop.id, crop.at, printed)),
        tokens: options.numbersTokens ?? TOKENS_PER_CALL,
      };
    },
    async translate(texts) {
      translated.push(texts);
      return {
        value: texts.map((text) => options.english?.[text] ?? `[en] ${text}`),
        tokens: options.translationTokens ?? NO_TOKENS,
      };
    },
  };
}

export function fakePages(pages: InventedPage[]): PageSource {
  return async function* () {
    for (const [index, page] of pages.entries()) {
      const width = page.width ?? 300;
      const height = page.height ?? 200;
      const pixels = Buffer.alloc(width * height, 255);
      const ink = ({ x, y, w, h }: Box) => {
        for (let row = Math.max(0, y); row < Math.min(height, y + h); row += 1) {
          pixels.fill(0, row * width + Math.max(0, x), row * width + Math.min(width, x + w));
        }
      };
      for (const number of page.numbers ?? []) {
        digitsOf(number).forEach((digit) => digit.strokes.forEach(ink));
      }
      (page.lines ?? []).forEach(ink);
      for (const box of page.rules ?? []) {
        ink({ x: box.x, y: box.y, w: box.w, h: 3 });
        ink({ x: box.x, y: box.y + box.h - 3, w: box.w, h: 3 });
        ink({ x: box.x, y: box.y, w: 3, h: box.h });
        ink({ x: box.x + box.w - 3, y: box.y, w: 3, h: box.h });
      }
      const image = await sharp(pixels, { raw: { width, height, channels: 1 } })
        .png()
        .toBuffer();
      yield { page: index + 1, image };
    }
  };
}

/** A digit 26 pixels tall, as the seven segments of a display: ink a finder can find. */
const DIGIT_HEIGHT = 26;
const SEGMENTS: Record<string, Box> = {
  a: { x: 0, y: 0, w: 14, h: 4 },
  b: { x: 10, y: 0, w: 4, h: 14 },
  c: { x: 10, y: 12, w: 4, h: 14 },
  d: { x: 0, y: 22, w: 14, h: 4 },
  e: { x: 0, y: 12, w: 4, h: 14 },
  f: { x: 0, y: 0, w: 4, h: 14 },
  g: { x: 0, y: 11, w: 14, h: 4 },
};
const DIGITS = [
  'abcdef',
  'bc',
  'abged',
  'abgcd',
  'fgbc',
  'afgcd',
  'afgedc',
  'abc',
  'abcdefg',
  'abcdfg',
];

/** Each digit of a printed number, where its ink is. */
function digitsOf(number: PrintedNumber): { digit: string; box: Box; strokes: Box[] }[] {
  let x = number.x;
  return [...number.text].map((digit) => {
    const segments = [...(DIGITS[Number(digit)] ?? '')].map((name) => SEGMENTS[name] as Box);
    const left = Math.min(...segments.map((segment) => segment.x));
    const right = Math.max(...segments.map((segment) => segment.x + segment.w));
    const strokes = segments.map((segment) => ({
      ...segment,
      x: x + segment.x - left,
      y: number.y + segment.y,
    }));
    const box = { x, y: number.y, w: right - left, h: DIGIT_HEIGHT };
    x += right - left + (number.gap ?? 3);
    return { digit, box, strokes };
  });
}

/** The digits printed inside the box, and whether the box caught only part of their number. */
function readCrop(id: number, at: Box, printed: PrintedNumber[]): NumberReading {
  const inside = (box: Box) => {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    return cx >= at.x && cx <= at.x + at.w && cy >= at.y && cy <= at.y + at.h;
  };
  for (const number of printed) {
    const digits = digitsOf(number);
    const caught = digits.filter((digit) => inside(digit.box));
    if (caught.length > 0) {
      return {
        id,
        number: caught.map((digit) => digit.digit).join(''),
        partial: caught.length < digits.length,
        unsure: number.unsure ?? false,
      };
    }
  }
  return { id, number: null, partial: false, unsure: false };
}

export function aDrawing(tavola: string, identity: Partial<SheetIdentity> = {}): InventedPage {
  return {
    identity: { kind: 'drawing', tavola, titleIt: `TAVOLA ${tavola}`, ...identity },
  };
}

export function aTableSheet(
  tavola: string,
  readings: [TableReading, TableReading?],
  identity: Partial<SheetIdentity> = {},
): InventedPage {
  return { identity: { kind: 'table', tavola, ...identity }, readings };
}

export function aTable(rows: ReadRow[], fields: Partial<TableReading> = {}): TableReading {
  return { layout: 'catalogue', ranges: [], rows, ...fields };
}

/** A row of the catalogue layout: *Figura / N° Ordinazione / N° Pezzi / Denominazione / Note*. */
export function aRow(
  position: string,
  number: string,
  nameIt: string,
  fields: Partial<ReadRow> = {},
): ReadRow {
  return {
    position,
    disegnoOrigine: '',
    numbers: number === '' ? [] : [{ number, range: '' }],
    quantity: '1',
    nameIt,
    note: '',
    unsure: [],
    ...fields,
  };
}

export interface OutputDirectory {
  path: string;
  remove(): Promise<void>;
}

/** Somewhere outside the repository to read into, thrown away afterwards. */
export async function givenOutputDirectory(): Promise<OutputDirectory> {
  const parent = await mkdtemp(join(tmpdir(), 'ricambi-reading-'));
  return {
    path: join(parent, 'read'),
    remove: () => rm(parent, { recursive: true, force: true }),
  };
}
