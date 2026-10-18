import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, inArray, notExists } from 'drizzle-orm';
import sharp from 'sharp';
import type { z } from 'zod';
import { numericPrefixOf } from '../catalog/naming.js';
import type { Db, DbSession } from '../db/client.js';
import {
  contributions,
  listings,
  marks,
  parts,
  positions,
  readingDoubts,
  scans,
  tableSheets,
  tavole,
  type NewPartRow,
} from '../db/schema.js';
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
import { createScanRepository } from '../repositories/scan-repository.js';
import { createTavolaRepository } from '../repositories/tavola-repository.js';
import { createScanService } from '../services/scan-service.js';
import { readDrawn, readQuantity } from '../sheets/cells.js';
import { delimiterOf, readSheet, type Sheet } from '../sheets/csv.js';
import { scanKeyPrefix, type FileStore } from '../storage/file-store.js';
import { createArchiveWriter, type ArchiveWriter } from './archive-writer.js';
import { inOneTransaction, type RowLocation, type RowProblem } from './load-archive.js';

/**
 * **Loading what the read command wrote** (ADR 0017) — the directory, as it stands, including
 * whatever an Editor corrected in `listings.csv` in the meantime.
 *
 * Every Tavola in it arrives **Unchecked**, which is what makes this a different load from the
 * Club's spreadsheets and why it may do what that one never does. An Unchecked Tavola holds no
 * curated work, so one already there is **discarded and loaded again whole** — its Positions,
 * Listings, Scan and Table sheets, and every Part that appears nowhere else — rather than merged
 * with. A **Published** one is somebody's checked work, and it is refused (ADR 0005).
 *
 * **The Marks the drawing proposed are loaded with it** (issue #33), from `marks.csv` as it stands,
 * and each doubt in `doubts.csv` becomes a doubt about its Position. Only ever onto the Unchecked
 * Tavola this load creates: a Published one is refused whole, its Marks included.
 *
 * **English is a Machine translation while it still says what the machine wrote** (issue #32).
 * An English name an Editor changed in `listings.csv` or `tavola.json` before loading is their
 * own, and arrives without the label.
 *
 * The same rules as the spreadsheet load otherwise: one transaction, a dry run that is the real
 * load rolled back, and nothing dropped without saying so.
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

export type TavolaOutcome = 'loaded' | 'replaced' | 'refused';

export interface ReadingLoadReport {
  reading: string;
  dryRun: boolean;
  model: string;
  tavole: {
    number: string;
    outcome: TavolaOutcome;
    readingMethod: string;
    listings: number;
    reason?: string;
  }[];
  /** Parts that appeared only on a Tavola that was discarded, and went with it. */
  partsDiscarded: number;
  scans: number;
  tableSheets: number;
  /** Marks proposed on the drawings, loaded onto their Positions. */
  marks: number;
  rejected: RowProblem[];
  warnings: RowProblem[];
}

/** Whether a source directory is one the read command wrote, rather than the Club's sheets. */
export async function isReadingDirectory(source: string): Promise<boolean> {
  return isFile(join(source, READING_FILE));
}

interface PendingFiles {
  tavolaId: string;
  directory: string;
  tavola: TavolaManifest;
  where: RowLocation;
}

export async function loadReading(options: ReadingLoadOptions): Promise<ReadingLoadReport> {
  const { db, source, dryRun = false } = options;
  const reading = await readManifest(source);
  const tavoleRead = await Promise.all(
    reading.tavole.map(async (directory) => ({
      directory,
      tavola: await readTavola(source, directory),
      sheet: await readListings(source, directory),
      marksSheet: await readOptionalSheet(source, directory, MARKS_FILE, [
        MARK_COLUMNS.position,
        MARK_COLUMNS.x,
        MARK_COLUMNS.y,
      ]),
      doubtsSheet: await readOptionalSheet(source, directory, DOUBTS_FILE, [
        DOUBT_COLUMNS.position,
        DOUBT_COLUMNS.doubt,
      ]),
    })),
  );

  const report: ReadingLoadReport = {
    reading: source,
    dryRun,
    model: `${reading.model.brand} ${reading.model.name}`,
    tavole: [],
    partsDiscarded: 0,
    scans: 0,
    tableSheets: 0,
    marks: 0,
    rejected: [],
    warnings: [],
  };
  const pending: PendingFiles[] = [];
  const discardedFiles: string[] = [];

  await inOneTransaction(db, dryRun, async (session) => {
    const writer = createArchiveWriter(session);
    const model = await writer.findOrAddModel({
      brand: reading.model.brand,
      name: reading.model.name,
      series: null,
      modelYears: null,
    });

    for (const { directory, tavola, sheet, marksSheet, doubtsSheet } of tavoleRead) {
      const where: RowLocation = {
        file: join(directory, TAVOLA_FILE),
        line: 1,
        at: `tavola ${tavola.number}`,
      };
      const refuse = (reason: string) => {
        report.tavole.push({
          number: tavola.number,
          outcome: 'refused',
          readingMethod: tavola.readingMethod,
          listings: 0,
          reason,
        });
        report.rejected.push({ ...where, reason });
      };

      if (tavola.titleIt === '') {
        refuse('It has no Italian title. Write the title printed on the sheet into tavola.json.');
        continue;
      }

      const [existing] = await session
        .select()
        .from(tavole)
        .where(and(eq(tavole.modelId, model.id), eq(tavole.number, tavola.number)))
        .limit(1);

      if (existing?.state === 'published') {
        refuse(
          'It is Published: an Editor has checked it, and it is corrected in Ricambi rather than ' +
            'loaded again.',
        );
        continue;
      }
      if (existing) {
        const discarded = await discardTavola(session, existing.id);
        if (discarded === 'has contributions') {
          refuse(
            'Its Unchecked copy has Contributions waiting on it, which reloading would lose. ' +
              'Review them first.',
          );
          continue;
        }
        report.partsDiscarded += discarded.parts;
        discardedFiles.push(...discarded.fileKeys);
      }

      const machine = new Map(
        tavola.machineTranslations.map(({ italian, english }) => [italian, english]),
      );
      if (tavola.titleEn === '') {
        report.warnings.push({
          ...where,
          reason:
            'It has no English title yet, so it carries the Italian one in both places, ' +
            'labelled until an Editor gives it English.',
        });
      }

      const [added] = await session
        .insert(tavole)
        .values({
          modelId: model.id,
          number: tavola.number,
          numberSort: numericPrefixOf(tavola.number),
          nameIt: tavola.titleIt,
          nameEn: tavola.titleEn || tavola.titleIt,
          // The Italian standing in for a missing English is no more checked than a translation.
          nameEnMachineTranslated:
            tavola.titleEn === '' || machine.get(tavola.titleIt) === tavola.titleEn,
          catalogSection: tavola.catalogSection,
          catalogGroup: tavola.catalogGroup,
          catalogSubgroup: tavola.catalogSubgroup,
          state: 'unchecked',
          readingMethod: tavola.readingMethod,
        })
        .returning({ id: tavole.id });
      const tavolaId = (added as { id: string }).id;

      const loaded = await loadListings(session, writer, report, sheet, {
        directory,
        tavolaId,
        modelId: model.id,
        machine,
      });
      if (marksSheet) {
        report.marks += await loadMarks(session, writer, report, marksSheet, {
          directory,
          tavolaId,
        });
      }
      if (doubtsSheet) {
        await loadPositionDoubts(session, writer, report, doubtsSheet, { directory, tavolaId });
      }
      report.tavole.push({
        number: tavola.number,
        outcome: existing ? 'replaced' : 'loaded',
        readingMethod: tavola.readingMethod,
        listings: loaded,
      });
      pending.push({ tavolaId, directory, tavola, where });
    }
  });

  for (const file of pending) {
    report.scans += file.tavola.scan ? 1 : 0;
    report.tableSheets += file.tavola.tableSheets.length;
  }
  if (!dryRun) {
    for (const key of discardedFiles) {
      await options.fileStore.remove(key).catch((error: unknown) => {
        options.logger.warn({ err: error, key }, 'Could not remove a discarded Tavola’s files');
      });
    }
    await storeFiles(options, pending, report);
  }

  return report;
}

/**
 * Takes an Unchecked Tavola out whole, and every Part that was listed on it and nowhere else.
 * Answers with the file prefixes its Scan and Table sheets were under, to be removed once the
 * load has committed.
 */
async function discardTavola(
  session: DbSession,
  tavolaId: string,
): Promise<{ parts: number; fileKeys: string[] } | 'has contributions'> {
  const listed = await session
    .select({ partId: listings.partId })
    .from(listings)
    .where(eq(listings.tavolaId, tavolaId));
  const partIds = [...new Set(listed.map((row) => row.partId))];

  const onIt = session
    .select({ id: positions.id })
    .from(positions)
    .where(eq(positions.tavolaId, tavolaId));
  const [waiting] = await session
    .select({ id: contributions.id })
    .from(contributions)
    .where(inArray(contributions.positionId, onIt))
    .limit(1);
  if (waiting) {
    return 'has contributions';
  }

  const [scan] = await session
    .select({ id: scans.id })
    .from(scans)
    .where(eq(scans.tavolaId, tavolaId));
  const sheets = await session
    .select({ id: tableSheets.id })
    .from(tableSheets)
    .where(eq(tableSheets.tavolaId, tavolaId));

  await session.delete(tavole).where(eq(tavole.id, tavolaId));

  let removed: { id: string }[] = [];
  if (partIds.length > 0) {
    removed = await session
      .delete(parts)
      .where(
        and(
          inArray(parts.id, partIds),
          notExists(
            session.select({ id: listings.id }).from(listings).where(eq(listings.partId, parts.id)),
          ),
          notExists(
            session
              .select({ id: contributions.id })
              .from(contributions)
              .where(eq(contributions.partId, parts.id)),
          ),
        ),
      )
      .returning({ id: parts.id });
  }

  return {
    parts: removed.length,
    fileKeys: [
      ...(scan ? [scanKeyPrefix(scan.id)] : []),
      ...sheets.map((sheet) => tableSheetKeyPrefix(sheet.id)),
    ],
  };
}

/**
 * The rows of `listings.csv`, as they stand. Answers how many Listings it loaded.
 *
 * Each Listing keeps the Table sheet it was read from, and a row's Doubt becomes a doubt about
 * that Listing and its Position, so an Editor checking the Tavola is taken to both (issue #34).
 */
async function loadListings(
  session: DbSession,
  writer: ArchiveWriter,
  report: ReadingLoadReport,
  sheet: Sheet,
  tavola: {
    directory: string;
    tavolaId: string;
    modelId: string;
    /** What the machine translated each Italian text as. */
    machine: Map<string, string>;
  },
): Promise<number> {
  const { directory, tavolaId, modelId, machine } = tavola;
  const c = LISTING_COLUMNS;
  let loaded = 0;

  for (const row of sheet.rows) {
    const position = row.get(c.position);
    const catalogNumber = row.get(c.catalogNumber);
    const where: RowLocation = {
      file: join(directory, LISTINGS_FILE),
      line: row.line,
      at: [position && `pos ${position}`, catalogNumber].filter(Boolean).join(' / ') || 'a row',
    };

    const nameIt = row.get(c.nameIt);
    if (nameIt === '') {
      report.rejected.push({ ...where, reason: 'A Part needs a name, and this row has none.' });
      continue;
    }

    const drawnCell = row.get(c.drawn);
    const drawn = drawnCell === '' ? { ok: true as const, value: true } : readDrawn(drawnCell);
    if (!drawn.ok) {
      report.rejected.push({
        ...where,
        reason: `${drawn.why}, and the archive will not guess which.`,
      });
      continue;
    }

    let quantityPerCar: number | null = null;
    const quantityCell = row.get(c.quantity);
    if (quantityCell !== '') {
      const quantity = readQuantity(quantityCell);
      if (quantity.ok) {
        quantityPerCar = quantity.value;
      } else {
        report.warnings.push({
          ...where,
          reason: `${quantity.why}, so the Listing is loaded without a quantity.`,
        });
      }
    }

    const positionId = position ? (await writer.findOrAddPosition(tavolaId, position)).id : null;
    const nameEn = row.get(c.nameEn);
    const catalogNote = row.get(c.catalogNote);
    const values: NewPartRow = {
      nameIt,
      nameEn: nameEn || null,
      nameEnMachineTranslated: nameEn !== '' && machine.get(nameIt) === nameEn,
      catalogNumber: catalogNumber || null,
      disegnoOrigine: row.get(c.disegnoOrigine) || null,
      catalogNote: catalogNote || null,
      // Always shown as a Machine translation, so only ever beside the note it translates.
      catalogNoteEn: (catalogNote && row.get(c.catalogNoteEn)) || null,
    };

    // The identity rule (ADR 0001): a Catalog Number the archive holds is that Part, listed again.
    const existing =
      (catalogNumber ? await writer.findPartByCatalogNumber(catalogNumber) : null) ??
      (catalogNumber
        ? null
        : await writer.findPartListedAs({ tavolaId, positionId, nameIt, nameEn: null }));
    const partId = existing
      ? (await writer.fillPart(existing, values), existing.id)
      : (await writer.addPart(values)).id;

    const tableSheetCell = row.get(c.tableSheet);
    const tableSheet = /^[1-9][0-9]*$/.test(tableSheetCell) ? Number(tableSheetCell) : null;
    if (tableSheetCell !== '' && tableSheet === null) {
      report.warnings.push({
        ...where,
        reason: `“${tableSheetCell}” is not the number of a Table sheet, so the row is not tied to one.`,
      });
    }

    const listing = await writer.findOrAddListing({
      partId,
      tavolaId,
      positionId,
      quantityPerCar,
      drawn: drawn.value,
      tableSheet,
    });
    const doubt = row.get(c.doubt);
    if (doubt !== '') {
      await session
        .insert(readingDoubts)
        .values({ tavolaId, listingId: listing.id, positionId, reason: doubt });
    }
    const qualifier = row.get(c.fitmentQualifier);
    if (qualifier !== '') {
      await writer.findOrAddFitment(partId, modelId, qualifier);
    }
    loaded += 1;
  }

  return loaded;
}

/**
 * The rows of `marks.csv`, as they stand: a Mark at each, on the Position its number names. A
 * number in no row of the table is a Position with no Listing yet, which its doubt says. Answers
 * how many Marks it loaded.
 */
async function loadMarks(
  session: DbSession,
  writer: ArchiveWriter,
  report: ReadingLoadReport,
  sheet: Sheet,
  tavola: { directory: string; tavolaId: string },
): Promise<number> {
  const c = MARK_COLUMNS;
  let loaded = 0;
  for (const row of sheet.rows) {
    const position = row.get(c.position);
    const where: RowLocation = {
      file: join(tavola.directory, MARKS_FILE),
      line: row.line,
      at: position ? `mark ${position}` : 'a mark',
    };
    if (position === '') {
      report.rejected.push({ ...where, reason: 'A Mark needs the number it marks.' });
      continue;
    }
    const x = fractionOf(row.get(c.x));
    const y = fractionOf(row.get(c.y));
    if (x === null || y === null) {
      report.rejected.push({
        ...where,
        reason: 'X and Y are fractions of the drawing, from 0 to 1, and this one is not.',
      });
      continue;
    }
    const { id: positionId } = await writer.findOrAddPosition(tavola.tavolaId, position);
    await session.insert(marks).values({ positionId, x, y });
    loaded += 1;
  }
  return loaded;
}

/** The rows of `doubts.csv`: a doubt about a Position as a whole, for the Editor checking it. */
async function loadPositionDoubts(
  session: DbSession,
  writer: ArchiveWriter,
  report: ReadingLoadReport,
  sheet: Sheet,
  tavola: { directory: string; tavolaId: string },
): Promise<void> {
  const c = DOUBT_COLUMNS;
  for (const row of sheet.rows) {
    const position = row.get(c.position);
    const reason = row.get(c.doubt);
    if (reason === '') {
      continue;
    }
    if (position === '') {
      report.warnings.push({
        file: join(tavola.directory, DOUBTS_FILE),
        line: row.line,
        at: 'a doubt',
        reason: 'A doubt names no Position, so it was not loaded.',
      });
      continue;
    }
    const { id: positionId } = await writer.findOrAddPosition(tavola.tavolaId, position);
    await session
      .insert(readingDoubts)
      .values({ tavolaId: tavola.tavolaId, listingId: null, positionId, reason });
  }
}

/** `0.4521`, or `0,4521` from Excel where the decimal separator is a comma. */
function fractionOf(cell: string): number | null {
  if (!/^\d*[.,]?\d+$/.test(cell)) {
    return null;
  }
  const value = Number(cell.replace(',', '.'));
  return value >= 0 && value <= 1 ? value : null;
}

/** The Scan and the Table sheets, after the catalog is committed: files are in no transaction. */
async function storeFiles(
  options: ReadingLoadOptions,
  pending: PendingFiles[],
  report: ReadingLoadReport,
): Promise<void> {
  const scanService = createScanService({
    tavolaRepository: createTavolaRepository(options.db),
    scanRepository: createScanRepository(options.db),
    fileStore: options.fileStore,
    clock: options.clock,
    logger: options.logger,
  });

  for (const { tavolaId, directory, tavola, where } of pending) {
    const warn = (reason: string) => report.warnings.push({ ...where, reason });

    if (tavola.scan) {
      try {
        await scanService.ingest(
          tavolaId,
          await readFile(join(options.source, directory, tavola.scan)),
        );
      } catch (error) {
        report.scans -= 1;
        warn(`The Scan could not be ingested: ${(error as Error).message}`);
      }
    }

    for (const [index, sheet] of tavola.tableSheets.entries()) {
      try {
        await storeTableSheet(
          options,
          tavolaId,
          index + 1,
          join(options.source, directory, sheet.file),
        );
      } catch (error) {
        report.tableSheets -= 1;
        warn(`Table sheet ${index + 1} could not be stored: ${(error as Error).message}`);
      }
    }
  }
}

async function storeTableSheet(
  options: ReadingLoadOptions,
  tavolaId: string,
  sheet: number,
  path: string,
): Promise<void> {
  const contents = await readFile(path);
  const { format, width, height } = await sharp(contents).metadata();
  if (!format || !width || !height) {
    throw new Error('It is not an image this archive can read.');
  }

  const id = randomUUID();
  const originalKey = `${tableSheetKeyPrefix(id)}/original.${format}`;
  await options.fileStore.write(originalKey, contents);
  try {
    await options.db.insert(tableSheets).values({
      id,
      tavolaId,
      sheet,
      format,
      byteSize: contents.byteLength,
      width,
      height,
      originalKey,
      ingestedAt: options.clock.now(),
    });
  } catch (error) {
    await options.fileStore.remove(tableSheetKeyPrefix(id)).catch(() => undefined);
    throw error;
  }
}

/** Where one Table sheet's file lives. */
export function tableSheetKeyPrefix(tableSheetId: string): string {
  return join('table-sheets', tableSheetId);
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
