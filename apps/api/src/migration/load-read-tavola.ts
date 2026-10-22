import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { discardTavola, removeDiscardedFiles } from '../catalog/discard-tavola.js';
import { numericPrefixOf } from '../catalog/naming.js';
import type { Db, DbSession } from '../db/client.js';
import { marks, readingDoubts, tableSheets, tavole, type NewPartRow } from '../db/schema.js';
import type { Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import { createScanRepository } from '../repositories/scan-repository.js';
import { createTavolaRepository } from '../repositories/tavola-repository.js';
import { createScanService } from '../services/scan-service.js';
import { readDrawn, readQuantity } from '../sheets/cells.js';
import { tableSheetKeyPrefix, type FileStore } from '../storage/file-store.js';
import { createArchiveWriter, type ArchiveWriter } from './archive-writer.js';
import { inOneTransaction, type RowLocation, type RowProblem } from './load-archive.js';

/**
 * **One read Tavola, as it stands** — held in memory, wherever it came from: the directory the
 * read command wrote, or a Catalog run.
 *
 * Its cells are text, as an Editor might have written them, and the loader is the one place that
 * decides what each means: a Drawn cell that says neither yes nor no is refused here, whoever
 * wrote it.
 */
export interface ReadTavola {
  number: string;
  titleIt: string;
  /** A Machine translation of `titleIt`, an Editor's English, or `''` where there is none. */
  titleEn: string;
  catalogSection: string | null;
  catalogGroup: string | null;
  catalogSubgroup: string | null;
  readingMethod: string;
  /** What the machine translated this Tavola's Italian as. English that still says it is one. */
  machineTranslations: { italian: string; english: string }[];
  /** The drawing, or `null` where the catalog has a table for this Tavola and no drawing. */
  scan: ReadImage | null;
  /** Each Table sheet, in order. */
  tableSheets: ReadImage[];
  listings: ReadListingRow[];
  /** The Marks the drawing proposed. */
  marks: ReadMarkRow[];
  /** Doubts about a Position as a whole, rather than about a row. */
  positionDoubts: ReadPositionDoubtRow[];
  /** Where each part of it came from, for the report. Named after the Tavola where not given. */
  from?: ReadTavolaSource;
}

/** An image's contents, fetched only once the Tavola is committed. */
export type ReadImage = () => Promise<Buffer>;

export interface ReadTavolaSource {
  tavola: string;
  listings: string;
  marks: string;
  doubts: string;
}

/** Where a row is, for the report: its line in a file, or its place in the list, from 1. */
interface ReadRow {
  line?: number;
}

export interface ReadListingRow extends ReadRow {
  /** `''` where nothing says which Position it sits at. */
  position: string;
  /** `yes` or `no`, as `readDrawn` reads it; `''` is drawn. */
  drawn: string;
  catalogNumber: string;
  disegnoOrigine: string;
  quantity: string;
  nameIt: string;
  nameEn: string;
  catalogNote: string;
  catalogNoteEn: string;
  fitmentQualifier: string;
  /** Which of the Tavola's Table sheets it was read from, counting from 1, or `''`. */
  tableSheet: string;
  doubt: string;
  readingNote: string;
}

export interface ReadMarkRow extends ReadRow {
  position: string;
  /** Fractions of the drawing, from 0 to 1, with a point or a comma. */
  x: string;
  y: string;
}

export interface ReadPositionDoubtRow extends ReadRow {
  position: string;
  doubt: string;
}

/**
 * **Loading read Tavole into the archive** (ADR 0017, issue #54).
 *
 * Every Tavola arrives **Unchecked**, which is what makes this a different load from the Club's
 * spreadsheets and why it may do what that one never does. An Unchecked Tavola holds no curated
 * work, so one already there is **discarded and loaded again whole** — its Positions, Listings,
 * Scan and Table sheets, and every Part that appears nowhere else — rather than merged with. A
 * **Published** one is somebody's checked work, and it is refused (ADR 0005), and so is one with
 * Contributions waiting on its Positions.
 *
 * **The Marks the drawing proposed are loaded with it** (issue #33), and each doubt becomes a
 * doubt about its Position. Only ever onto the Unchecked Tavola this load creates.
 *
 * **English is a Machine translation while it still says what the machine wrote** (issue #32).
 * English an Editor changed is their own, and arrives without the label.
 *
 * One transaction for all of them, a dry run that is the real load rolled back, and nothing
 * dropped without saying so.
 */
export interface ReadTavoleLoadOptions {
  db: Db;
  fileStore: FileStore;
  clock: Clock;
  logger: Logger;
  /** What the Tavole were read from, for the report. */
  reading: string;
  /** Found, or added, by all three. A reading directory names no series. */
  model: { brand: string; name: string; series?: string | null };
  tavole: ReadTavola[];
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

interface PendingFiles {
  tavolaId: string;
  tavola: ReadTavola;
  where: RowLocation;
}

export async function loadReadTavole(options: ReadTavoleLoadOptions): Promise<ReadingLoadReport> {
  const { db, dryRun = false } = options;
  const report: ReadingLoadReport = {
    reading: options.reading,
    dryRun,
    model: `${options.model.brand} ${options.model.name}`,
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
      brand: options.model.brand,
      name: options.model.name,
      series: options.model.series ?? null,
      modelYears: null,
    });

    for (const tavola of options.tavole) {
      const from = sourceOf(tavola);
      const where: RowLocation = { file: from.tavola, line: 1, at: `tavola ${tavola.number}` };
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
        report.partsDiscarded += discarded.parts.length;
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

      const loaded = await loadListings(session, writer, report, tavola.listings, {
        file: from.listings,
        tavolaId,
        modelId: model.id,
        machine,
      });
      report.marks += await loadMarks(session, writer, report, tavola.marks, {
        file: from.marks,
        tavolaId,
      });
      await loadPositionDoubts(session, writer, report, tavola.positionDoubts, {
        file: from.doubts,
        tavolaId,
      });
      report.tavole.push({
        number: tavola.number,
        outcome: existing ? 'replaced' : 'loaded',
        readingMethod: tavola.readingMethod,
        listings: loaded,
      });
      pending.push({ tavolaId, tavola, where });
    }
  });

  for (const file of pending) {
    report.scans += file.tavola.scan ? 1 : 0;
    report.tableSheets += file.tavola.tableSheets.length;
  }
  if (!dryRun) {
    await removeDiscardedFiles(options.fileStore, options.logger, discardedFiles);
    await storeFiles(options, pending, report);
  }

  return report;
}

function sourceOf(tavola: ReadTavola): ReadTavolaSource {
  const named = `Tavola ${tavola.number}`;
  return (
    tavola.from ?? {
      tavola: named,
      listings: `${named}, Listings`,
      marks: `${named}, Marks`,
      doubts: `${named}, doubts`,
    }
  );
}

/**
 * The Listings, as they stand. Answers how many it loaded.
 *
 * Each Listing keeps the Table sheet it was read from and its Reading note, and a row's Doubt
 * becomes a doubt about that Listing and its Position, so an Editor checking the Tavola is taken
 * to both (issues #34, #56).
 */
async function loadListings(
  session: DbSession,
  writer: ArchiveWriter,
  report: ReadingLoadReport,
  rows: ReadListingRow[],
  tavola: {
    file: string;
    tavolaId: string;
    modelId: string;
    /** What the machine translated each Italian text as. */
    machine: Map<string, string>;
  },
): Promise<number> {
  const { file, tavolaId, modelId, machine } = tavola;
  let loaded = 0;

  for (const [index, row] of rows.entries()) {
    const { position, catalogNumber } = row;
    const where: RowLocation = {
      file,
      line: row.line ?? index + 1,
      at: [position && `pos ${position}`, catalogNumber].filter(Boolean).join(' / ') || 'a row',
    };

    const { nameIt } = row;
    if (nameIt === '') {
      report.rejected.push({ ...where, reason: 'A Part needs a name, and this row has none.' });
      continue;
    }

    const drawn = row.drawn === '' ? { ok: true as const, value: true } : readDrawn(row.drawn);
    if (!drawn.ok) {
      report.rejected.push({
        ...where,
        reason: `${drawn.why}, and the archive will not guess which.`,
      });
      continue;
    }

    let quantityPerCar: number | null = null;
    if (row.quantity !== '') {
      const quantity = readQuantity(row.quantity);
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
    const { nameEn, catalogNote } = row;
    const values: NewPartRow = {
      nameIt,
      nameEn: nameEn || null,
      nameEnMachineTranslated: nameEn !== '' && machine.get(nameIt) === nameEn,
      catalogNumber: catalogNumber || null,
      disegnoOrigine: row.disegnoOrigine || null,
      catalogNote: catalogNote || null,
      // Always shown as a Machine translation, so only ever beside the note it translates.
      catalogNoteEn: (catalogNote && row.catalogNoteEn) || null,
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

    const tableSheet = /^[1-9][0-9]*$/.test(row.tableSheet) ? Number(row.tableSheet) : null;
    if (row.tableSheet !== '' && tableSheet === null) {
      report.warnings.push({
        ...where,
        reason: `“${row.tableSheet}” is not the number of a Table sheet, so the row is not tied to one.`,
      });
    }

    const listing = await writer.findOrAddListing({
      partId,
      tavolaId,
      positionId,
      quantityPerCar,
      drawn: drawn.value,
      tableSheet,
      readingNote: row.readingNote || null,
    });
    if (row.doubt !== '') {
      await session
        .insert(readingDoubts)
        .values({ tavolaId, listingId: listing.id, positionId, reason: row.doubt });
    }
    if (row.fitmentQualifier !== '') {
      await writer.findOrAddFitment(partId, modelId, row.fitmentQualifier);
    }
    loaded += 1;
  }

  return loaded;
}

/**
 * The Marks, as they stand: a Mark at each, on the Position its number names. A number in no
 * Listing is a Position with no Listing yet, which its doubt says. Answers how many it loaded.
 */
async function loadMarks(
  session: DbSession,
  writer: ArchiveWriter,
  report: ReadingLoadReport,
  rows: ReadMarkRow[],
  tavola: { file: string; tavolaId: string },
): Promise<number> {
  let loaded = 0;
  for (const [index, row] of rows.entries()) {
    const { position } = row;
    const where: RowLocation = {
      file: tavola.file,
      line: row.line ?? index + 1,
      at: position ? `mark ${position}` : 'a mark',
    };
    if (position === '') {
      report.rejected.push({ ...where, reason: 'A Mark needs the number it marks.' });
      continue;
    }
    const x = fractionOf(row.x);
    const y = fractionOf(row.y);
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

/** A doubt about a Position as a whole, for the Editor checking it. */
async function loadPositionDoubts(
  session: DbSession,
  writer: ArchiveWriter,
  report: ReadingLoadReport,
  rows: ReadPositionDoubtRow[],
  tavola: { file: string; tavolaId: string },
): Promise<void> {
  for (const [index, row] of rows.entries()) {
    const { position, doubt: reason } = row;
    if (reason === '') {
      continue;
    }
    if (position === '') {
      report.warnings.push({
        file: tavola.file,
        line: row.line ?? index + 1,
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
  options: ReadTavoleLoadOptions,
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

  for (const { tavolaId, tavola, where } of pending) {
    const warn = (reason: string) => report.warnings.push({ ...where, reason });

    if (tavola.scan) {
      try {
        await scanService.ingest(tavolaId, await tavola.scan());
      } catch (error) {
        report.scans -= 1;
        warn(`The Scan could not be ingested: ${(error as Error).message}`);
      }
    }

    for (const [index, sheet] of tavola.tableSheets.entries()) {
      try {
        await storeTableSheet(options, tavolaId, index + 1, await sheet());
      } catch (error) {
        report.tableSheets -= 1;
        warn(`Table sheet ${index + 1} could not be stored: ${(error as Error).message}`);
      }
    }
  }
}

async function storeTableSheet(
  options: ReadTavoleLoadOptions,
  tavolaId: string,
  sheet: number,
  contents: Buffer,
): Promise<void> {
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
