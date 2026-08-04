import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { CURRENCIES, EQUIVALENT_KINDS } from '../db/schema.js';

/**
 * What the club's spreadsheets mean, written down beside them.
 *
 * **The code is versioned here and the mapping is versioned with the material it describes.** A
 * loader with column names compiled into it would be a loader that has to be edited — and
 * reviewed, and released — because somebody renamed a column in Excel; a plan file next to the
 * export is a thing the person doing the export can read and correct. What it cannot do is
 * decide anything: every judgement it records is a judgement somebody made about a real sheet,
 * and the report prints them back so the load is answerable afterwards.
 */
export class MigrationPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationPlanError';
  }
}

/**
 * **The one thing on ticket 13 that code cannot do for itself.** The catalog row reads
 * `260 03 150 | 207 | ASTA GUIDA … | 2 | 208503`, and the draft spreadsheet labels the *first*
 * column Disegno Origine where the conventional order of an Italian factory catalog would make
 * it the last. Both fields exist either way; what changes is which one carries the uniqueness
 * rule, and therefore which number the archive deduplicates the club's parts by. Getting it
 * backwards is not a cosmetic error — it is one Part where there should be two, permanently.
 *
 * One uncropped page settles it, and only a person can look at one. So the loader refuses to
 * run until somebody has written down what they looked at, and the report prints it back.
 */
const PLACEHOLDER_CONFIRMATIONS = /^(tbd|todo|t\.b\.d\.?|unknown|unsure|none|n\/a|\?+|-+)$/i;

/**
 * Long enough that it cannot be a word. It is not a measure of diligence and does not pretend to
 * be one — no check can read a catalog page — but "the first column, page 41, checked by X" does
 * not fit in less, and a field that took a shrug is the failure this is placed against.
 */
const A_SENTENCE = 20;

const catalogColumnsSchema = z
  .object({
    /** Which page was looked at, by whom, and what it showed. */
    confirmedAgainst: z.string().trim().min(1),
    catalogNumber: z.string().trim().min(1),
    disegnoOrigine: z.string().trim().min(1),
  })
  .superRefine((columns, context) => {
    if (
      PLACEHOLDER_CONFIRMATIONS.test(columns.confirmedAgainst) ||
      columns.confirmedAgainst.length < A_SENTENCE
    ) {
      context.addIssue({
        code: 'custom',
        path: ['confirmedAgainst'],
        message:
          'Which column is the Catalog Number and which the Disegno Origine has to be confirmed ' +
          'against an uncropped catalog page before any loading begins, because the Catalog ' +
          'Number is what the archive tells two Parts apart by. Write down here which page was ' +
          'looked at and what it showed — the report prints it back.',
      });
    }
    if (columns.catalogNumber === columns.disegnoOrigine) {
      context.addIssue({
        code: 'custom',
        path: ['disegnoOrigine'],
        message: 'The Catalog Number and the Disegno Origine cannot be the same column.',
      });
    }
  });

const modelSchema = z.object({
  /** How the sheets name this car in their Model column. */
  key: z.string().trim().min(1),
  brand: z.string().trim().min(1),
  name: z.string().trim().min(1),
  series: z.string().trim().nullish(),
  modelYears: z.string().trim().nullish(),
  /**
   * The column of the repeating vehicle block that stands for this car. Blank means the Part
   * does not fit it; `x` that it does; anything else is the qualifier, in the words it was
   * written in.
   */
  fitmentColumn: z.string().trim().nullish(),
});

const equivalentColumnSchema = z
  .object({
    column: z.string().trim().min(1),
    kind: z.enum(EQUIVALENT_KINDS),
    /** Whose number the column holds — *Girling*, *Fiat*, *DIN*. */
    maker: z.string().trim().nullish(),
    /**
     * What the cell itself is. A supplier column holds a **reference** and the maker is the
     * column; a donor-vehicle column holds the **maker** — the car — and there is usually no
     * reference at all, because nobody knows what the other manufacturer called it.
     */
    cell: z.enum(['reference', 'maker']).default('reference'),
    /** Where the maker varies by row rather than being the column's own. */
    makerColumn: z.string().trim().nullish(),
    noteColumn: z.string().trim().nullish(),
  })
  .superRefine((column, context) => {
    if (column.cell === 'reference' && !column.maker && !column.makerColumn) {
      context.addIssue({
        code: 'custom',
        path: ['maker'],
        message: `The column "${column.column}" holds a reference, so it needs a maker: whose number is it?`,
      });
    }
  });

const sourceColumnsSchema = z
  .object({
    /** The shop, where a group of columns is one shop. */
    name: z.string().trim().nullish(),
    nameColumn: z.string().trim().nullish(),
    urlColumn: z.string().trim().min(1),
    priceColumn: z.string().trim().nullish(),
    /** A fixed currency for the column, where the sheet prints bare amounts. */
    currency: z.enum(CURRENCIES).nullish(),
    currencyColumn: z.string().trim().nullish(),
    observedOnColumn: z.string().trim().nullish(),
    conditionColumn: z.string().trim().nullish(),
    noteColumn: z.string().trim().nullish(),
  })
  .superRefine((columns, context) => {
    if (!columns.name && !columns.nameColumn) {
      context.addIssue({
        code: 'custom',
        path: ['name'],
        message: 'A Source needs a name: either the column group is one shop, or a column says.',
      });
    }
  });

const planSchema = z.object({
  /** A semicolon wherever the sheets were exported on a machine that writes 24,50. */
  delimiter: z.string().length(1).default(','),
  /**
   * Which way round the sheets write `03/04/2025`. Nothing can read that off the cell, and a
   * guess is silently a month wrong, so it is declared here and printed back in the report.
   */
  dateOrder: z.enum(['day-first', 'month-first']).default('day-first'),
  catalogColumns: catalogColumnsSchema,
  models: z.array(modelSchema).min(1),
  tavole: z.object({
    file: z.string().trim().min(1),
    columns: z.object({
      model: z.string().trim().min(1),
      number: z.string().trim().min(1),
      nameIt: z.string().trim().min(1),
      nameEn: z.string().trim().min(1),
      category: z.string().trim().min(1),
      catalogSection: z.string().trim().nullish(),
      catalogGroup: z.string().trim().nullish(),
      catalogSubgroup: z.string().trim().nullish(),
      /** The scan's file name within the scans directory. */
      scan: z.string().trim().nullish(),
    }),
  }),
  parts: z.object({
    file: z.string().trim().min(1),
    columns: z.object({
      model: z.string().trim().min(1),
      tavola: z.string().trim().min(1),
      position: z.string().trim().nullish(),
      nameIt: z.string().trim().nullish(),
      nameEn: z.string().trim().nullish(),
      quantityPerCar: z.string().trim().nullish(),
      drawn: z.string().trim().nullish(),
      description: z.string().trim().nullish(),
      dimensions: z.string().trim().nullish(),
      materialFinish: z.string().trim().nullish(),
      catalogNote: z.string().trim().nullish(),
      note: z.string().trim().nullish(),
      relatedPositions: z.string().trim().nullish(),
      subAssembly: z.string().trim().nullish(),
      subAssemblyPositions: z.string().trim().nullish(),
    }),
    equivalents: z.array(equivalentColumnSchema).default([]),
    sources: z.array(sourceColumnsSchema).default([]),
  }),
  scans: z.object({ directory: z.string().trim().min(1) }).default({ directory: 'scans' }),
});

export type ArchivePlan = z.infer<typeof planSchema>;
export type PlannedModel = ArchivePlan['models'][number];
/** One shop's columns: a name, an address, and optionally what it cost when somebody looked. */
export type PlannedSourceColumns = ArchivePlan['parts']['sources'][number];

export const PLAN_FILE = 'plan.json';

/** Reads and validates the plan beside the sheets. Nothing is opened until it passes. */
export async function readPlan(directory: string): Promise<ArchivePlan> {
  const path = join(directory, PLAN_FILE);

  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    throw new MigrationPlanError(
      `No ${PLAN_FILE} in ${directory}. It is what says which column of the club's ` +
        'spreadsheets is which; see docs/operations/archive-migration.md.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new MigrationPlanError(`${path} is not valid JSON: ${(cause as Error).message}`);
  }

  const plan = planSchema.safeParse(parsed);
  if (!plan.success) {
    const problems = plan.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new MigrationPlanError(`${path} does not describe a loadable archive:\n${problems}`);
  }

  const keys = plan.data.models.map((model) => model.key);
  const repeated = keys.find((key, index) => keys.indexOf(key) !== index);
  if (repeated) {
    throw new MigrationPlanError(`${path} names the Model "${repeated}" twice.`);
  }

  return plan.data;
}

/**
 * Every column the plan names, so a sheet missing one is refused **before** anything is written
 * rather than quietly loading a catalog with no quantities in it. A renamed column is the most
 * likely thing to be wrong with an export, and it is silent by nature: an absent column reads
 * exactly like a column of empty cells.
 */
export function columnsNamedFor(columns: Record<string, string | null | undefined>): string[] {
  return Object.values(columns).filter((column): column is string => Boolean(column));
}
