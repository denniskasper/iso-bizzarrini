import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { PageSource } from '../../src/reading/read-catalog.js';
import type {
  ReadRow,
  ReadingMethod,
  SheetIdentity,
  TableReading,
  Tokens,
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
}

export const TOKENS_PER_CALL: Tokens = { input: 1000, output: 200 };

export function fakeReadingMethod(pages: InventedPage[]): ReadingMethod & { calls: string[] } {
  const calls: string[] = [];
  const pageOf = (page: number): InventedPage => pages[page - 1] ?? {};

  return {
    name: 'a fake Reading method',
    calls,
    async identify(sheet) {
      calls.push(`identify ${sheet.page}`);
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
      return { value: identity, tokens: TOKENS_PER_CALL };
    },
    async readTable(sheet, reading) {
      calls.push(`read ${sheet.page} ${reading}`);
      const [first, second] = pageOf(sheet.page).readings ?? [aTable([])];
      return {
        value: reading === 2 && second ? second : first,
        tokens: TOKENS_PER_CALL,
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
