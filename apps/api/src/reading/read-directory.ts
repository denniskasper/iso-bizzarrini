import { z } from 'zod';
import { identitySchema } from './claude-requests.js';

/**
 * **What the read command writes, and what `archive:load` reads back** — one description, so the
 * two cannot drift apart.
 *
 * ```
 * reading.json              the Model, the Reading method, the Tavole in it
 * pages.json                what every page was found to be, so a resumed run need not ask again
 * cost.json                 what the run cost, per Tavola, sheet and Reading, beside its estimate
 * cost-2.json …             the same, for each run resumed in the directory
 * set-aside.csv             every page that is not in a Tavola, and why
 * set-aside/page-12.png     …and the page itself, for a person to look at
 * tavola-84/
 *   tavola.json             number, title, the factory's header, the sheets
 *   scan.png                the drawing, upright the way its headings read
 *   table-1.png …           each Table sheet, upright
 *   listings.csv            one row per Listing, opened and corrected in Excel
 *   marks.csv               one row per Mark proposed on the drawing, in fractions of it
 *   doubts.csv              each Position listed with no Mark, and each Mark listed nowhere
 * ```
 *
 * The directory is the Club's material and stays out of the repository (ADR 0017, `AGENTS.md`).
 */
export const READING_FILE = 'reading.json';
export const PAGES_FILE = 'pages.json';
export const COST_FILE = 'cost.json';
export const TAVOLA_FILE = 'tavola.json';
export const LISTINGS_FILE = 'listings.csv';
export const SCAN_FILE = 'scan.png';
export const MARKS_FILE = 'marks.csv';
export const DOUBTS_FILE = 'doubts.csv';
export const SET_ASIDE_FILE = 'set-aside.csv';
export const SET_ASIDE_DIRECTORY = 'set-aside';

/** The first run's cost record is `cost.json`; each resumed run writes one of its own. */
export function costFile(run: number): string {
  return run === 1 ? COST_FILE : `cost-${run}.json`;
}

export function tableSheetFile(sheet: number): string {
  return `table-${sheet}.png`;
}

/** A directory name for a Tavola number as printed: `84`, `12 bis` → `tavola-84`, `tavola-12-bis`. */
export function tavolaDirectory(number: string): string {
  return `tavola-${number.trim().replace(/[^A-Za-z0-9]+/g, '-')}`;
}

export const readingManifestSchema = z.object({
  model: z.object({ brand: z.string().trim().min(1), name: z.string().trim().min(1) }),
  readingMethod: z.string().trim().min(1),
  /** The PDF's file name, never its path. */
  readFrom: z.string(),
  /** The Tavole's directories, in the order they were read. */
  tavole: z.array(z.string().trim().min(1)),
});

export type ReadingManifest = z.infer<typeof readingManifestSchema>;

/** What each page was found to be, in the order they were asked. */
export const pagesManifestSchema = z.object({
  pages: z.array(
    z.object({
      page: z.number().int(),
      identity: identitySchema,
    }),
  ),
});

export type PagesManifest = z.infer<typeof pagesManifestSchema>;

export const tavolaManifestSchema = z.object({
  number: z.string().trim().min(1),
  titleIt: z.string().trim(),
  /**
   * A Machine translation of `titleIt`, or empty where there is none. An Editor may rewrite it
   * before loading, and then it is theirs rather than the machine's.
   */
  titleEn: z.string().trim(),
  catalogSection: z.string().trim().nullable(),
  catalogGroup: z.string().trim().nullable(),
  catalogSubgroup: z.string().trim().nullable(),
  readingMethod: z.string().trim().min(1),
  /** The drawing, or `null` where the catalog has a table for this Tavola and no drawing. */
  scan: z.string().nullable(),
  tableSheets: z.array(
    z.object({ file: z.string(), page: z.number().int(), foglio: z.string().nullable() }),
  ),
  /**
   * What the machine translated this Tavola's Italian as. An English name in `listings.csv` or
   * `titleEn` that still says this is a Machine translation; one an Editor changed is their own.
   */
  machineTranslations: z.array(z.object({ italian: z.string(), english: z.string() })).default([]),
});

export type TavolaManifest = z.infer<typeof tavolaManifestSchema>;

/**
 * The columns of `listings.csv`. The last three are for the Editor checking it: the loader keeps
 * the Table sheet, the Doubt and the Reading note, for the checking screen.
 * The two English columns are Machine translations until an Editor changes them.
 */
export const LISTING_COLUMNS = {
  position: 'Position',
  drawn: 'Drawn',
  catalogNumber: 'Catalog Number',
  disegnoOrigine: 'Disegno Origine',
  quantity: 'Quantity',
  nameIt: 'Denominazione',
  nameEn: 'Name (English)',
  catalogNote: 'Catalog Note',
  catalogNoteEn: 'Catalog Note (English)',
  fitmentQualifier: 'Fitment qualifier',
  tableSheet: 'Table sheet',
  doubt: 'Doubt',
  readingNote: 'Reading note',
} as const;

/**
 * The columns of `marks.csv`. X runs across the drawing and Y down it, both from `0` to `1`
 * (ADR 0013). A row an Editor deletes is a Mark not loaded; a Position an Editor rewrites is the
 * number the Mark is loaded for.
 */
export const MARK_COLUMNS = {
  position: 'Position',
  x: 'X',
  y: 'Y',
  readingNote: 'Reading note',
} as const;

/** The columns of `doubts.csv`: a doubt about a Position as a whole, rather than about a row. */
export const DOUBT_COLUMNS = { position: 'Position', doubt: 'Doubt' } as const;

export const SET_ASIDE_COLUMNS = { page: 'Page', file: 'File', reason: 'Why' } as const;
