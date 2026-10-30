import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Currency, EquivalentKind, SourceCondition } from '@ricambi/contracts';
import { TransactionRollbackError } from 'drizzle-orm';
import type { Db, DbSession } from '../db/client.js';
import type { NewPartRow, PositionRow } from '../db/schema.js';
import type { Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import { createScanRepository } from '../repositories/scan-repository.js';
import { createTavolaRepository } from '../repositories/tavola-repository.js';
import { createSampleServiceOn } from '../services/sample-service.js';
import { createScanService } from '../services/scan-service.js';
import type { FileStore } from '../storage/file-store.js';
import { createArchiveWriter, type ArchiveWriter, type Written } from './archive-writer.js';
import {
  readCondition,
  readCurrency,
  readDrawn,
  readObservedOn,
  readPositionSpans,
  readPrice,
  readQuantity,
  readsAsFitted,
  splitPositionNumbers,
  splitReferences,
  type DateOrder,
  type PositionSpan,
} from '../sheets/cells.js';
import { readSheet, type Sheet, type SheetRow } from '../sheets/csv.js';
import {
  columnsNamedFor,
  readPlan,
  type ArchivePlan,
  type PlannedModel,
  type PlannedSourceColumns,
} from './plan.js';

/**
 * **The migration of the club's existing archive** — the spreadsheets and the scans that have
 * sat on private machines for years — into Models, Tavole, Positions, Parts, Listings,
 * Fitments, Equivalents, Sources, Sub-assemblies and Related Positions.
 *
 * Three properties are what make it safe to run against the real archive, and everything about
 * the shape of this file follows from them:
 *
 * **It is re-runnable.** Every write is a find-or-add, so a second run over a corrected sheet
 * adds what is new and touches nothing else. It fills empty fields and never overwrites a full
 * one, because by the time this is run twice an Editor may well have improved what it loaded the
 * first time, and ADR 0005 exists precisely because a bulk import that silently overwrites
 * curated work is how an archive loses it.
 *
 * **A dry run is the real load, rolled back.** Not a projection of it: the same code writes the
 * same rows through the same constraints inside one transaction, and the transaction is
 * abandoned at the end. So "what it would create" is what it did create, and a load that would
 * fail on a constraint fails in the rehearsal instead of half way through the performance.
 *
 * **Nothing is dropped silently.** A row the archive cannot accept is *rejected* with the line
 * it came from and the reason; a row it can accept but a *part* of which it cannot — an
 * unreadable quantity, a price with no date — is loaded and the loss is *warned* about. Both
 * lists are the report, and the report is a file somebody reads afterwards.
 *
 * What it deliberately does **not** load is Marks. No existing data records where a Position
 * sits on a scan; placing them is an Editor's afternoon per sheet and it is the project's
 * critical path (spec, Further Notes). Inventing them here would be inventing evidence.
 */
export interface ArchiveLoadOptions {
  db: Db;
  fileStore: FileStore;
  clock: Clock;
  logger: Logger;
  /** The directory holding `plan.json`, the exported sheets and the scans. */
  source: string;
  /** Report what would happen, write nothing. */
  dryRun?: boolean;
}

/** Created, or found already there. The two are what a re-run is judged by. */
export interface Tally {
  created: number;
  matched: number;
}

/** Where in the club's material something was, so a person can go and look at it. */
export interface RowLocation {
  file: string;
  line: number;
  /** Which row it was, in the words of the sheet — "grifo / tavola 2 / pos 207". */
  at: string;
}

/** Something the report has to say about one line of one sheet. */
export interface RowProblem extends RowLocation {
  reason: string;
}

export interface ArchiveLoadReport {
  archive: string;
  dryRun: boolean;
  /** What settled which catalog column is the Catalog Number, and who looked at it. */
  confirmedAgainst: string;
  /**
   * Which way round the sheets' dates were read. Printed back for the same reason the line
   * above is: nothing in a cell can tell `03/04/2025` apart, so somebody decided.
   */
  dateOrder: DateOrder;
  /** Rows of the **parts** sheet: the sheets of Tavole and Models are counted below. */
  rowsRead: number;
  rowsLoaded: number;
  models: Tally;
  tavole: Tally;
  positions: Tally;
  parts: Tally;
  /**
   * Fields that were empty in the archive and are not any more — a Part's description, a
   * Listing's quantity, a Fitment's qualification. **Nothing that had a value is counted here,
   * because nothing that had a value is written to.**
   */
  fieldsFilled: number;
  listings: Tally;
  fitments: Tally;
  equivalents: Tally;
  sources: Tally;
  subAssemblies: Tally;
  relatedPositions: Tally;
  scans: { ingested: number; alreadyIngested: number };
  /**
   * Which column was read as which kind of Equivalent. It is a judgement somebody made about a
   * spreadsheet — that this column is an OE supplier's number and that one a donor car — and
   * the report is where it stays answerable afterwards.
   */
  equivalentColumns: { column: string; kind: EquivalentKind; maker: string | null }[];
  rejected: RowProblem[];
  warnings: RowProblem[];
}

export async function loadArchive(options: ArchiveLoadOptions): Promise<ArchiveLoadReport> {
  const { db, source, dryRun = false } = options;

  const plan = await readPlan(source);
  const tavoleSheet = await openSheet(source, plan.tavole.file, plan.delimiter);
  const partsSheet = await openSheet(source, plan.parts.file, plan.delimiter);

  assertSheetHas(tavoleSheet, columnsNamedFor(plan.tavole.columns));
  assertSheetHas(partsSheet, [
    ...columnsNamedFor(plan.parts.columns),
    plan.catalogColumns.catalogNumber,
    plan.catalogColumns.disegnoOrigine,
    ...plan.models.map((model) => model.fitmentColumn),
    ...plan.parts.equivalents.flatMap((column) => [
      column.column,
      column.makerColumn,
      column.noteColumn,
    ]),
    ...plan.parts.sources.flatMap((group) => [
      group.nameColumn,
      group.urlColumn,
      group.priceColumn,
      group.currencyColumn,
      group.observedOnColumn,
      group.conditionColumn,
      group.noteColumn,
    ]),
  ]);

  const report = blankReport(source, dryRun, plan);
  const pending: PendingScan[] = [];

  await inOneTransaction(db, dryRun, async (session) => {
    const loading = await beginLoading(session, plan, report);
    await loadTavole(loading, tavoleSheet, source, pending);
    await loadParts(loading, partsSheet);
  });

  report.scans.ingested = dryRun ? pending.length : await ingestScans(options, pending, report);

  return report;
}

/**
 * The load, and its abandonment.
 *
 * One transaction for the whole spreadsheet, which is also what makes a failure half way
 * through leave the archive as it was rather than half migrated. The dry run's rollback comes
 * back as an exception by design, and it is the only one swallowed here.
 */
export async function inOneTransaction(
  db: Db,
  rollback: boolean,
  work: (session: DbSession) => Promise<void>,
): Promise<void> {
  try {
    await db.transaction(async (transaction) => {
      await work(transaction);
      if (rollback) {
        transaction.rollback();
      }
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) {
      throw error;
    }
  }
}

/** What every sheet row is loaded against: the plan, the archive, and what to say about it. */
interface Loading {
  plan: ArchivePlan;
  writer: ArchiveWriter;
  report: ArchiveLoadReport;
  modelIds: Map<string, string>;
  tavolaIds: Map<string, string>;
  /** Read once per Tavola, because both second passes below walk the same numbers. */
  positionsByTavola: Map<string, Map<string, PositionRow>>;
  /** What the sheet said belongs together, resolved after every row has been read. */
  groups: { tavolaId: string; name: string; spans: PositionSpan[]; where: RowLocation }[];
  links: { tavolaId: string; from: string; numbers: string[]; where: RowLocation }[];
}

async function beginLoading(
  session: DbSession,
  plan: ArchivePlan,
  report: ArchiveLoadReport,
): Promise<Loading> {
  const writer = createArchiveWriter(session);
  const modelIds = new Map<string, string>();

  // The cars come from the plan and not from a sheet: they are few, they carry a brand, a
  // series and model years that no column of a parts spreadsheet holds, and the repeating
  // vehicle block names them by column. One list, read by both.
  for (const model of plan.models) {
    const written = await writer.findOrAddModel({
      brand: model.brand,
      name: model.name,
      series: model.series ?? null,
      modelYears: model.modelYears ?? null,
    });
    count(report, report.models, written);
    modelIds.set(model.key, written.id);
  }

  return {
    plan,
    writer,
    report,
    modelIds,
    tavolaIds: new Map(),
    positionsByTavola: new Map(),
    groups: [],
    links: [],
  };
}

interface PendingScan {
  tavolaId: string;
  file: string;
  where: RowLocation;
}

/** The drawings themselves: number, both names, the Category, and the factory's own header. */
async function loadTavole(
  loading: Loading,
  sheet: Sheet,
  source: string,
  pending: PendingScan[],
): Promise<void> {
  const { plan, writer, report } = loading;
  const columns = plan.tavole.columns;

  for (const row of sheet.rows) {
    const at = `${row.get(columns.model)} / tavola ${row.get(columns.number)}`;
    const where: RowLocation = { file: sheet.file, line: row.line, at };
    const refuse = (reason: string) => report.rejected.push({ ...where, reason });

    const modelKey = row.get(columns.model);
    const modelId = loading.modelIds.get(modelKey);
    if (!modelId) {
      refuse(`No Model "${modelKey}" — the plan names ${namesOf(plan.models)}.`);
      continue;
    }

    const number = row.get(columns.number);
    const nameIt = row.get(columns.nameIt);
    const nameEn = row.get(columns.nameEn);
    const category = row.get(columns.category);
    if (number === '' || nameIt === '' || nameEn === '' || category === '') {
      refuse('A Tavola needs a number, an Italian and an English name, and a Category.');
      continue;
    }

    const written = await writer.findOrAddTavola({
      modelId,
      number,
      nameIt,
      nameEn,
      category,
      catalogSection: blankAsAbsent(row.get(columns.catalogSection)),
      catalogGroup: blankAsAbsent(row.get(columns.catalogGroup)),
      catalogSubgroup: blankAsAbsent(row.get(columns.catalogSubgroup)),
    });
    count(report, report.tavole, written);
    loading.tavolaIds.set(sheetKey(modelKey, number), written.id);

    const scan = row.get(columns.scan);
    if (scan === '') {
      continue;
    }
    if (await writer.hasScan(written.id)) {
      // Already ingested by an earlier run or uploaded by an Editor. Re-ingesting would give
      // the drawing a new address and throw away every browser's cached copy of it.
      report.scans.alreadyIngested += 1;
      continue;
    }
    const path = join(source, plan.scans.directory, scan);
    if (await isReadableFile(path)) {
      pending.push({ tavolaId: written.id, file: path, where });
    } else {
      report.warnings.push({
        ...where,
        reason: `The scan "${scan}" is not in ${plan.scans.directory}/. The Tavola is loaded without a drawing.`,
      });
    }
  }
}

/** The catalog rows themselves — and everything hanging off them. */
async function loadParts(loading: Loading, sheet: Sheet): Promise<void> {
  const { report } = loading;
  report.rowsRead = sheet.rows.length;

  for (const row of sheet.rows) {
    if (await loadPartRow(loading, sheet, row)) {
      report.rowsLoaded += 1;
    }
  }

  await groupPositions(loading);
  await linkPositions(loading);
}

async function loadPartRow(loading: Loading, sheet: Sheet, row: SheetRow): Promise<boolean> {
  const { plan, writer, report } = loading;
  const columns = plan.parts.columns;

  const modelKey = row.get(columns.model);
  const tavolaNumber = row.get(columns.tavola);
  const positionNumber = row.get(columns.position);
  const catalogNumber = blankAsAbsent(row.get(plan.catalogColumns.catalogNumber));

  const where: RowLocation = {
    file: sheet.file,
    line: row.line,
    at: [
      modelKey,
      `tavola ${tavolaNumber}`,
      positionNumber && `pos ${positionNumber}`,
      catalogNumber,
    ]
      .filter(Boolean)
      .join(' / '),
  };
  const refuse = (reason: string) => {
    report.rejected.push({ ...where, reason });
    return false;
  };
  const warn = (reason: string) => report.warnings.push({ ...where, reason });

  const tavolaId = loading.tavolaIds.get(sheetKey(modelKey, tavolaNumber));
  if (!tavolaId) {
    return refuse(
      `No Tavola "${tavolaNumber}" for "${modelKey}" — ${plan.tavole.file} does not have that drawing.`,
    );
  }

  const nameIt = blankAsAbsent(row.get(columns.nameIt));
  const nameEn = blankAsAbsent(row.get(columns.nameEn));
  if (nameIt === null && nameEn === null) {
    // A row that could be shown to a member as a blank line is not a Part.
    return refuse('A Part needs a name, and this row has neither an Italian nor an English one.');
  }

  let drawn = true;
  const drawnCell = row.get(columns.drawn);
  if (drawnCell !== '') {
    const reading = readDrawn(drawnCell);
    if (!reading.ok) {
      // The one field this loader will not guess at: a drawn Listing is an alternative and an
      // undrawn one is a fixing needed as well, and confusing them is the wrong parts arriving.
      return refuse(`${reading.why}, and the archive will not guess which.`);
    }
    drawn = reading.value;
  }

  let quantityPerCar: number | null = null;
  const quantityCell = row.get(columns.quantityPerCar);
  if (quantityCell !== '') {
    const reading = readQuantity(quantityCell);
    if (reading.ok) {
      quantityPerCar = reading.value;
    } else {
      // "a.r." — a richiesta — and "2 per side" are both in these columns. The Part is worth
      // having without the count; the count is not worth inventing.
      warn(`${reading.why}, so the Listing is loaded without a quantity.`);
    }
  }

  let positionId: string | null = null;
  if (positionNumber !== '') {
    const position = await writer.findOrAddPosition(tavolaId, positionNumber);
    count(report, report.positions, position);
    positionId = position.id;
  }

  const values: NewPartRow = {
    nameEn,
    nameIt,
    catalogNumber,
    disegnoOrigine: blankAsAbsent(row.get(plan.catalogColumns.disegnoOrigine)),
    description: blankAsAbsent(row.get(columns.description)),
    dimensions: blankAsAbsent(row.get(columns.dimensions)),
    materialFinish: blankAsAbsent(row.get(columns.materialFinish)),
    catalogNote: blankAsAbsent(row.get(columns.catalogNote)),
    note: blankAsAbsent(row.get(columns.note)),
  };

  // **Where the identity rule is applied** (ADR 0001): the Catalog Number is what tells two Parts
  // apart, so a row carrying one the archive already holds is another *appearance* of that Part
  // rather than a second Part.
  //
  // Both branches fall back to the Listing the row made last time. For a row that never had a
  // number that is the only handle there is. For a row that has just *acquired* one — the
  // commonest correction there is, since the loop this loader is built for is "fix the sheet and
  // run it again" — it is what stops the correction recording a second Part beside the first and
  // printing the two at one Position as though they were alternatives.
  const existing =
    (catalogNumber ? await writer.findPartByCatalogNumber(catalogNumber) : null) ??
    (await writer.findPartListedAs({ tavolaId, positionId, nameIt, nameEn }));

  let partId: string;
  if (existing) {
    partId = existing.id;
    report.parts.matched += 1;
    // Which is also how the number itself arrives: an empty field being filled, like any other.
    report.fieldsFilled += await writer.fillPart(existing, values);
  } else {
    partId = (await writer.addPart(values)).id;
    report.parts.created += 1;
  }

  const listing = await writer.findOrAddListing({
    partId,
    tavolaId,
    positionId,
    quantityPerCar,
    drawn,
  });
  count(report, report.listings, listing);

  await loadFitments(loading, row, partId);
  await loadEquivalents(loading, row, partId, warn);
  await loadSources(loading, row, partId, warn);

  const related = splitPositionNumbers(row.get(columns.relatedPositions));
  if (related.length > 0) {
    if (positionId === null) {
      warn('Related Parts are recorded between numbers on a sheet, and this row has no number.');
    } else {
      loading.links.push({ tavolaId, from: positionId, numbers: related, where });
    }
  }

  const groupName = row.get(columns.subAssembly);
  if (groupName !== '') {
    const spans = readPositionSpans(row.get(columns.subAssemblyPositions));
    const covered = spans.length > 0 ? spans : positionNumber ? [{ number: positionNumber }] : [];
    if (covered.length === 0) {
      warn(`The Sub-assembly "${groupName}" names no numbers, and the row has none of its own.`);
    } else {
      loading.groups.push({ tavolaId, name: groupName, spans: covered, where });
    }
  }

  return true;
}

/** The repeating vehicle block: a column per car, and a cell that is a qualifier or a tick. */
async function loadFitments(loading: Loading, row: SheetRow, partId: string): Promise<void> {
  for (const model of loading.plan.models) {
    const cell = row.get(model.fitmentColumn);
    if (cell === '') {
      continue;
    }

    const modelId = loading.modelIds.get(model.key);
    if (!modelId) {
      continue;
    }

    // A tick says only that it fits. Anything else is what somebody knew about *when* it fits,
    // in their words — "fino al telaio 310", "late" — and it is transcribed and never parsed.
    const qualifier = readsAsFitted(cell) ? null : cell;
    count(
      loading.report,
      loading.report.fitments,
      await loading.writer.findOrAddFitment(partId, modelId, qualifier),
    );
  }
}

/** The fixed supplier and OEM columns, each a kind of Equivalent the plan assigned. */
async function loadEquivalents(
  loading: Loading,
  row: SheetRow,
  partId: string,
  warn: (reason: string) => void,
): Promise<void> {
  for (const column of loading.plan.parts.equivalents) {
    const cell = row.get(column.column);
    if (cell === '') {
      continue;
    }

    const note = blankAsAbsent(row.get(column.noteColumn));

    for (const value of splitReferences(cell)) {
      // A donor vehicle's column holds the car itself and no reference: nobody knows what the
      // other manufacturer called the part, and the car alone is what sends somebody looking.
      const maker =
        column.cell === 'maker'
          ? value
          : (blankAsAbsent(row.get(column.makerColumn)) ?? column.maker);
      const reference = column.cell === 'maker' ? null : value;

      if (!maker) {
        warn(`"${column.column}" has a reference but nothing says whose number it is.`);
        continue;
      }

      count(
        loading.report,
        loading.report.equivalents,
        await loading.writer.findOrAddEquivalent({
          partId,
          kind: column.kind,
          maker,
          reference,
          note,
        }),
      );
    }
  }
}

/** Where the Part has been available — and the price rule the archive turns on. */
async function loadSources(
  loading: Loading,
  row: SheetRow,
  partId: string,
  warn: (reason: string) => void,
): Promise<void> {
  for (const group of loading.plan.parts.sources) {
    const url = row.get(group.urlColumn);
    const name = group.name ?? row.get(group.nameColumn);
    const priceCell = row.get(group.priceColumn);

    if (url === '') {
      if (priceCell !== '' || (name ?? '') !== '') {
        warn(
          `An offer from "${name || group.nameColumn}" has no address in "${group.urlColumn}", ` +
            'and a Source is somewhere a member can go and look. It is not loaded.',
        );
      }
      continue;
    }
    if (!name) {
      warn(`A Source at ${url} has no name, and is not loaded.`);
      continue;
    }

    let condition: SourceCondition | null = null;
    const conditionCell = row.get(group.conditionColumn);
    if (conditionCell !== '') {
      const reading = readCondition(conditionCell);
      if (reading.ok) {
        condition = reading.value;
      } else {
        warn(`${reading.why}, so the Source is loaded without one.`);
      }
    }

    const price = readObservedPrice(row, group, priceCell, loading.plan.dateOrder, warn);

    count(
      loading.report,
      loading.report.sources,
      await loading.writer.findOrAddSource({
        partId,
        name,
        url,
        condition,
        priceAmount: price?.amount ?? null,
        priceCurrency: price?.currency ?? null,
        observedOn: price?.observedOn ?? null,
        note: blankAsAbsent(row.get(group.noteColumn)),
      }),
    );
  }
}

/**
 * **A price and the date it was seen are one fact, and this is where a spreadsheet's are turned
 * into one or into neither.**
 *
 * A figure from 2011 printed with no date reads as this morning's, which is how an archive
 * misleads somebody by accident and exactly what the reference sites this product replaces do.
 * So an undated price is not loaded as a price — the Source still is, because *where* a part has
 * been available is worth more than what it cost on a day nobody wrote down.
 */
function readObservedPrice(
  row: SheetRow,
  group: PlannedSourceColumns,
  priceCell: string,
  dateOrder: DateOrder,
  warn: (reason: string) => void,
): { amount: number; currency: Currency; observedOn: string } | null {
  const observedCell = row.get(group.observedOnColumn);

  if (priceCell === '') {
    if (observedCell !== '') {
      warn(`"${observedCell}" is a date with no price beside it, so nothing is recorded from it.`);
    }
    return null;
  }

  const amount = readPrice(priceCell);
  if (!amount.ok) {
    warn(`${amount.why}, so the Source is loaded without a price.`);
    return null;
  }

  if (observedCell === '') {
    warn(
      `The price "${priceCell}" carries no date, so the Source is loaded without it — a price ` +
        'without the day it was seen would read as today’s.',
    );
    return null;
  }

  const observedOn = readObservedOn(observedCell, dateOrder);
  if (!observedOn.ok) {
    warn(`${observedOn.why}, so the price it dates is not loaded.`);
    return null;
  }

  // **Read, never cast.** The four currencies are a check constraint, so a cell reading "Euro"
  // that was passed through would not be a bad row in the report — it would be a refused INSERT
  // inside the one transaction the whole load runs in, and therefore the whole archive rolled
  // back with nothing written and no report to say why.
  const currencyCell = row.get(group.currencyColumn);
  if (!group.currency && currencyCell === '') {
    warn(`The price "${priceCell}" is in no currency anybody recorded, so it is not loaded.`);
    return null;
  }

  const currency = group.currency
    ? { ok: true as const, value: group.currency }
    : readCurrency(currencyCell);
  if (!currency.ok) {
    warn(`${currency.why}, so the price "${priceCell}" is not loaded.`);
    return null;
  }

  return { amount: amount.value, currency: currency.value, observedOn: observedOn.value };
}

/** The `Sub-Assembly` column and its position ranges, resolved once every number exists. */
async function groupPositions(loading: Loading): Promise<void> {
  for (const group of loading.groups) {
    const onSheet = await positionsOf(loading, group.tavolaId);
    const written = await loading.writer.findOrAddSubAssembly(group.tavolaId, group.name);
    count(loading.report, loading.report.subAssemblies, written);

    for (const span of group.spans) {
      const covered = resolveSpan(span, onSheet);
      if (covered.length === 0) {
        loading.report.warnings.push({
          ...group.where,
          reason: `The Sub-assembly "${group.name}" covers ${describe(span)}, and no such number is on the sheet.`,
        });
        continue;
      }

      for (const position of covered) {
        const grouping = await loading.writer.putInSubAssembly(position.id, written.id);
        if (grouping === 'in another group') {
          loading.report.warnings.push({
            ...group.where,
            reason: `Position ${position.number} is already in another Sub-assembly, so it stays there.`,
          });
        }
      }
    }
  }
}

/** The `Related Parts` column, become links that read from both ends. */
async function linkPositions(loading: Loading): Promise<void> {
  for (const link of loading.links) {
    const onSheet = await positionsOf(loading, link.tavolaId);

    for (const number of link.numbers) {
      const other = onSheet.get(number);
      if (!other) {
        loading.report.warnings.push({
          ...link.where,
          reason: `Related to position ${number}, which is not on this sheet.`,
        });
        continue;
      }
      if (other.id === link.from) {
        loading.report.warnings.push({
          ...link.where,
          reason: `Related to itself (${number}), which says nothing.`,
        });
        continue;
      }

      count(
        loading.report,
        loading.report.relatedPositions,
        await loading.writer.relatePositions(link.from, other.id),
      );
    }
  }
}

async function positionsOf(loading: Loading, tavolaId: string): Promise<Map<string, PositionRow>> {
  const known = loading.positionsByTavola.get(tavolaId);
  if (known) {
    return known;
  }

  const rows = await loading.writer.positionsOn(tavolaId);
  const byNumber = new Map(rows.map((position) => [position.number, position]));
  loading.positionsByTavola.set(tavolaId, byNumber);
  return byNumber;
}

/**
 * A range is resolved against the numbers the sheet actually has rather than expanded
 * arithmetically, so `207–211` takes in a `210 S` and invents no `209` that nobody has recorded.
 */
function resolveSpan(span: PositionSpan, onSheet: Map<string, PositionRow>): PositionRow[] {
  if ('number' in span) {
    const position = onSheet.get(span.number);
    return position ? [position] : [];
  }

  return [...onSheet.values()].filter(
    (position) =>
      position.numberSort !== null &&
      position.numberSort >= span.from &&
      position.numberSort <= span.to,
  );
}

/** The scans, after the catalog is committed: files are not part of any transaction. */
async function ingestScans(
  options: ArchiveLoadOptions,
  pending: PendingScan[],
  report: ArchiveLoadReport,
): Promise<number> {
  if (pending.length === 0) {
    return 0;
  }

  const scanService = createScanService({
    tavolaRepository: createTavolaRepository(options.db),
    scanRepository: createScanRepository(options.db),
    sampleService: createSampleServiceOn(options.db, {
      fileStore: options.fileStore,
      clock: options.clock,
      logger: options.logger,
    }),
    fileStore: options.fileStore,
    clock: options.clock,
    logger: options.logger,
  });

  let ingested = 0;
  for (const scan of pending) {
    try {
      await scanService.ingest(scan.tavolaId, await readFile(scan.file));
      ingested += 1;
    } catch (error) {
      // One unreadable drawing is not a reason to lose the other three hundred.
      report.warnings.push({
        ...scan.where,
        reason: `The scan could not be ingested: ${(error as Error).message}`,
      });
    }
  }
  return ingested;
}

async function openSheet(source: string, file: string, delimiter: string): Promise<Sheet> {
  let text: string;
  try {
    text = await readFile(join(source, file), 'utf8');
  } catch {
    throw new Error(`The plan names ${file}, and there is no such file in ${source}.`);
  }
  return readSheet(file, text, delimiter);
}

/**
 * A column the plan names and the export does not have is refused **before anything is
 * written**. It is the most likely thing to be wrong with an export and the quietest: an absent
 * column reads exactly like a column of empty cells, and the archive would load without a single
 * quantity in it and say nothing.
 */
function assertSheetHas(sheet: Sheet, named: (string | null | undefined)[]): void {
  const missing = [...new Set(named.filter(Boolean) as string[])].filter(
    (column) => !sheet.columns.includes(column),
  );

  if (missing.length > 0) {
    throw new Error(
      `${sheet.file} has no column called ${missing.map((column) => `"${column}"`).join(', ')}. ` +
        `It has: ${sheet.columns.join(', ')}.`,
    );
  }
}

function blankReport(source: string, dryRun: boolean, plan: ArchivePlan): ArchiveLoadReport {
  const nothing = (): Tally => ({ created: 0, matched: 0 });

  return {
    archive: source,
    dryRun,
    confirmedAgainst: plan.catalogColumns.confirmedAgainst,
    dateOrder: plan.dateOrder,
    rowsRead: 0,
    rowsLoaded: 0,
    models: nothing(),
    tavole: nothing(),
    positions: nothing(),
    parts: nothing(),
    fieldsFilled: 0,
    listings: nothing(),
    fitments: nothing(),
    equivalents: nothing(),
    sources: nothing(),
    subAssemblies: nothing(),
    relatedPositions: nothing(),
    scans: { ingested: 0, alreadyIngested: 0 },
    equivalentColumns: plan.parts.equivalents.map((column) => ({
      column: column.column,
      kind: column.kind,
      maker: column.cell === 'maker' ? null : (column.maker ?? null),
    })),
    rejected: [],
    warnings: [],
  };
}

function count(report: ArchiveLoadReport, tally: Tally, written: Written): void {
  if (written.created) {
    tally.created += 1;
  } else {
    tally.matched += 1;
  }
  // A record that was already there may still have had an empty field the sheet can fill.
  report.fieldsFilled += written.filled ?? 0;
}

function sheetKey(modelKey: string, tavolaNumber: string): string {
  return `${modelKey} / ${tavolaNumber}`;
}

function namesOf(models: PlannedModel[]): string {
  return models.map((model) => `"${model.key}"`).join(', ');
}

function describe(span: PositionSpan): string {
  return 'number' in span ? `position ${span.number}` : `positions ${span.from}–${span.to}`;
}

/** A blank cell is a fact the sheet does not carry, never an empty string in the archive. */
function blankAsAbsent(cell: string): string | null {
  return cell === '' ? null : cell;
}

async function isReadableFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
