import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { PageSource } from '../../src/reading/read-catalog.js';
import {
  UsageLimitReached,
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
 * No test calls a model (ADR 0016). The fake answers each page with what the test says is
 * printed on it, and the same fixed token counts every time, so what is asserted is everything
 * above the seam: which sheet went to which Tavola, what the rows were taken to mean, where the
 * two Readings were compared, and what was written for an Editor to open.
 *
 * The pages are blank images of a size each test chooses, because nothing here reads them — the
 * size is what shows a sheet was turned.
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
      const image = await sharp({
        create: {
          width: page.width ?? 300,
          height: page.height ?? 200,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .png()
        .toBuffer();
      yield { page: index + 1, image };
    }
  };
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
