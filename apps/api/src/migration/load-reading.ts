import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { z } from 'zod';
import type { Db } from '../db/client.js';
import type { Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import {
  DOUBTS_FILE,
  DOUBT_COLUMNS,
  LISTING_COLUMNS,
  LISTINGS_FILE,
  MARKS_FILE,
  MARK_COLUMNS,
  READING_FILE,
  TAVOLA_FILE,
  readingManifestSchema,
  tavolaManifestSchema,
  type ReadingManifest,
  type TavolaManifest,
} from '../reading/read-directory.js';
import { delimiterOf, readSheet, type Sheet } from '../sheets/csv.js';
import type { FileStore } from '../storage/file-store.js';
import { loadReadTavole, type ReadTavola, type ReadingLoadReport } from './load-read-tavola.js';

export type { ReadingLoadReport, TavolaOutcome } from './load-read-tavola.js';

/**
 * **Loading what the read command wrote** (ADR 0017) — the directory, as it stands, including
 * whatever an Editor corrected in `listings.csv` in the meantime.
 *
 * Only the directory is this module's: it reads `reading.json`, each `tavola.json` and the CSVs
 * beside it into read Tavole, and hands them to the loader (`load-read-tavola.ts`), which holds
 * every rule about what arrives Unchecked, what is replaced and what is refused (issue #54). A
 * file that is missing or not what the read command writes stops the load before anything is
 * written.
 */
export interface ReadingLoadOptions {
  db: Db;
  fileStore: FileStore;
  clock: Clock;
  logger: Logger;
  /** The directory the read command wrote. */
  source: string;
  dryRun?: boolean;
}

/** Whether a source directory is one the read command wrote, rather than the Club's sheets. */
export async function isReadingDirectory(source: string): Promise<boolean> {
  return isFile(join(source, READING_FILE));
}

export async function loadReading(options: ReadingLoadOptions): Promise<ReadingLoadReport> {
  const { source } = options;
  const reading = await readManifest(source);
  const tavole = await Promise.all(
    reading.tavole.map((directory) => readTavolaDirectory(source, directory)),
  );
  return loadReadTavole({
    db: options.db,
    fileStore: options.fileStore,
    clock: options.clock,
    logger: options.logger,
    reading: source,
    model: reading.model,
    tavole,
    dryRun: options.dryRun ?? false,
  });
}

/** One Tavola's directory, as a read Tavola. Its images are read only when they are stored. */
async function readTavolaDirectory(source: string, directory: string): Promise<ReadTavola> {
  const tavola = await readTavola(source, directory);
  const listings = await readListings(source, directory);
  const marksSheet = await readOptionalSheet(source, directory, MARKS_FILE, [
    MARK_COLUMNS.position,
    MARK_COLUMNS.x,
    MARK_COLUMNS.y,
  ]);
  const doubtsSheet = await readOptionalSheet(source, directory, DOUBTS_FILE, [
    DOUBT_COLUMNS.position,
    DOUBT_COLUMNS.doubt,
  ]);
  const image = (file: string) => () => readFile(join(source, directory, file));
  const c = LISTING_COLUMNS;
  const m = MARK_COLUMNS;
  const d = DOUBT_COLUMNS;

  return {
    number: tavola.number,
    titleIt: tavola.titleIt,
    titleEn: tavola.titleEn,
    catalogSection: tavola.catalogSection,
    catalogGroup: tavola.catalogGroup,
    catalogSubgroup: tavola.catalogSubgroup,
    readingMethod: tavola.readingMethod,
    machineTranslations: tavola.machineTranslations,
    scan: tavola.scan ? image(tavola.scan) : null,
    tableSheets: tavola.tableSheets.map((sheet) => image(sheet.file)),
    listings: listings.rows.map((row) => ({
      line: row.line,
      position: row.get(c.position),
      drawn: row.get(c.drawn),
      catalogNumber: row.get(c.catalogNumber),
      disegnoOrigine: row.get(c.disegnoOrigine),
      quantity: row.get(c.quantity),
      nameIt: row.get(c.nameIt),
      nameEn: row.get(c.nameEn),
      catalogNote: row.get(c.catalogNote),
      catalogNoteEn: row.get(c.catalogNoteEn),
      fitmentQualifier: row.get(c.fitmentQualifier),
      tableSheet: row.get(c.tableSheet),
      doubt: row.get(c.doubt),
      readingNote: row.get(c.readingNote),
    })),
    marks: (marksSheet?.rows ?? []).map((row) => ({
      line: row.line,
      position: row.get(m.position),
      x: row.get(m.x),
      y: row.get(m.y),
    })),
    positionDoubts: (doubtsSheet?.rows ?? []).map((row) => ({
      line: row.line,
      position: row.get(d.position),
      doubt: row.get(d.doubt),
    })),
    from: {
      tavola: join(directory, TAVOLA_FILE),
      listings: join(directory, LISTINGS_FILE),
      marks: join(directory, MARKS_FILE),
      doubts: join(directory, DOUBTS_FILE),
    },
  };
}

async function readManifest(source: string): Promise<ReadingManifest> {
  return parsed(readingManifestSchema, await readJson(join(source, READING_FILE)), READING_FILE);
}

async function readTavola(source: string, directory: string): Promise<TavolaManifest> {
  const file = join(directory, TAVOLA_FILE);
  return parsed(tavolaManifestSchema, await readJson(join(source, file)), file);
}

async function readListings(source: string, directory: string): Promise<Sheet> {
  const file = join(directory, LISTINGS_FILE);
  let text: string;
  try {
    text = await readFile(join(source, file), 'utf8');
  } catch {
    throw new Error(`${file} is missing from ${source}.`);
  }
  // Excel on a machine whose decimal separator is a comma saves with semicolons.
  const sheet = readSheet(file, text, delimiterOf(text));
  const missing = [LISTING_COLUMNS.nameIt, LISTING_COLUMNS.position].filter(
    (column) => !sheet.columns.includes(column),
  );
  if (missing.length > 0) {
    throw new Error(
      `${file} has no column called ${missing.map((column) => `"${column}"`).join(', ')}.`,
    );
  }
  return sheet;
}

/** A sheet the read command writes beside some Tavole only: `null` where this one has none. */
async function readOptionalSheet(
  source: string,
  directory: string,
  name: string,
  columns: string[],
): Promise<Sheet | null> {
  const file = join(directory, name);
  if (!(await isFile(join(source, file)))) {
    return null;
  }
  const text = await readFile(join(source, file), 'utf8');
  const sheet = readSheet(file, text, delimiterOf(text));
  const missing = columns.filter((column) => !sheet.columns.includes(column));
  if (missing.length > 0) {
    throw new Error(
      `${file} has no column called ${missing.map((column) => `"${column}"`).join(', ')}.`,
    );
  }
  return sheet;
}

async function readJson(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    throw new Error(`${path} is missing.`);
  }
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new Error(`${path} is not valid JSON: ${(cause as Error).message}`);
  }
}

function parsed<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
  file: string,
): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`${file} is not what the read command writes:\n${problems}`);
  }
  return result.data;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
