import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { numericPrefixOf } from '../catalog/naming.js';
import { writeSheet } from '../sheets/csv.js';
import { compareReadings } from './compare.js';
import {
  Spending,
  dollars,
  priceListEntry,
  rounded,
  type CostRecord,
  type SheetCost,
  type Spent,
} from './cost.js';
import { interpretTable, type ComparedSheet, type ReadListing } from './interpret.js';
import { PRICE_LIST, priceOf } from './price-list.js';
import { Translations, maskCodes, type MachineTranslation } from './translation.js';
import {
  LISTING_COLUMNS,
  LISTINGS_FILE,
  PAGES_FILE,
  READING_FILE,
  SCAN_FILE,
  SET_ASIDE_COLUMNS,
  SET_ASIDE_DIRECTORY,
  SET_ASIDE_FILE,
  TAVOLA_FILE,
  costFile,
  pagesManifestSchema,
  readingManifestSchema,
  tableSheetFile,
  tavolaDirectory,
  tavolaManifestSchema,
  type PagesManifest,
  type ReadingManifest,
  type TavolaManifest,
} from './read-directory.js';
import {
  UsageLimitReached,
  type ReadingMethod,
  type SheetEstimate,
  type SheetIdentity,
  type SheetImage,
  type Tokens,
} from './reading-method.js';

/**
 * **The read command** (ADR 0016): a catalog PDF in, a directory of plain files out, which
 * `archive:load` turns into Unchecked Tavole.
 *
 * Every page is first asked what it is and whose. A sheet belongs to the Tavola printed on it and
 * never to the page it follows — the scans are out of order — and one whose number cannot be read
 * is set aside for a person rather than guessed. Each sheet is turned upright the way its headings
 * read. Then every Table sheet is read twice, independently, the two Readings are compared, and
 * what the factory meant by its dashes, repeats and ranges is worked out once, here. Last, the
 * Tavola's Italian is put into English, as a Machine translation (`translation.ts`).
 *
 * Nothing is sent to be read before the whole run has been estimated and found within the limit
 * it was given, and nothing is sent that could take it past that limit (`cost.ts`).
 */
export interface ReadCatalogOptions {
  pdf: string;
  out: string;
  /**
   * The car the catalog is for. A Tavola's number means something only within its Model. A
   * resumed run takes it from the directory, and refuses one that differs.
   */
  model?: { brand: string; name: string };
  method: ReadingMethod;
  pages: PageSource;
  /**
   * The most the run may cost, in dollars. There is no default, so nobody spends by accident:
   * a run without one does not start.
   */
  limit: number | undefined;
  /**
   * Carry on in a directory an earlier run stopped in: pages already asked about are not asked
   * again, and Tavole already finished are not read again.
   */
  resume?: boolean;
  /** Where each line of the running report goes. */
  print: (line: string) => void;
  /** The repository the output must stay out of. Found from this file when not given. */
  repositoryRoot?: string;
}

/** The pages of a PDF as images, in order. */
export type PageSource = (pdf: string) => AsyncIterable<SheetImage>;

export interface ReadCatalogResult {
  tavole: { number: string; directory: string; listings: number; inDoubt: number }[];
  setAside: { page: number; reason: string }[];
  tokens: Tokens;
  /**
   * Tavole the run stopped before finishing, because the next sheet could have passed the limit or
   * the subscription's usage limit was reached.
   */
  notRead: string[];
  /** Tavole an earlier run in the same directory finished, which this one left alone. */
  readBefore: string[];
  cost: CostRecord;
}

export class ReadCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReadCatalogError';
  }
}

interface IdentifiedSheet extends SheetImage {
  identity: SheetIdentity;
}

export async function readCatalog(options: ReadCatalogOptions): Promise<ReadCatalogResult> {
  const { method, print, limit } = options;
  const out = resolve(options.out);
  assertOutside(out, options.repositoryRoot ?? repositoryRootOf());
  const previous = options.resume
    ? await previousReading(out, options.pdf, options.model)
    : await assertEmpty(out).then(() => null);
  const model = previous?.manifest.model ?? options.model;
  if (!model) {
    throw new ReadCatalogError('Say which car the catalog is for, with --brand and --model.');
  }

  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
    throw new ReadCatalogError(
      'Give a spending limit in dollars, such as --limit 20. There is no default, so that ' +
        'nobody spends by accident; the run never passes the limit it is given.',
    );
  }
  const price = priceOf(method.model);
  if (!price) {
    throw new ReadCatalogError(
      `The price list has no price for ${method.model}, so what it costs cannot be known. ` +
        'Add it to src/reading/price-list.ts, with the date it was checked.',
    );
  }
  const spending = new Spending(limit, price);
  const run = previous ? previous.run + 1 : 1;
  const costFileName = costFile(run);

  print(
    `Reading with ${method.name}: ` +
      (method.charged
        ? 'billed per use.'
        : 'not charged. Its cost is what it would have been at list prices.'),
  );

  // What earlier runs in this directory already found and finished, which is not asked again.
  const known = new Map(
    (previous?.pages.pages ?? []).map(({ page, identity }) => [page, identity]),
  );
  const finishedBefore = new Set(previous?.manifest.tavole ?? []);
  const translations = new Translations(previous?.translations ?? []);
  const readBefore = (number: string) => finishedBefore.has(tavolaDirectory(number));
  const stillToRead = (identity: SheetIdentity) => {
    const number = identity.tavola?.trim();
    return identity.kind === 'table' && !!number && !readBefore(number);
  };

  // Before anything is sent to be read: every page still to be asked about, counted, and the whole
  // run estimated.
  const pages: SheetImage[] = [];
  for await (const page of options.pages(options.pdf)) {
    pages.push(page);
  }
  const estimates = new Map<number, SheetEstimate>();
  let estimate = 0;
  for (const page of pages) {
    const identity = known.get(page.page);
    if (identity && !stillToRead(identity)) {
      continue;
    }
    const sheet = await method.estimate(page);
    estimates.set(page.page, sheet);
    estimate += identity ? spending.readingOf(sheet) : spending.estimateOf(sheet);
  }
  print(
    `Estimated at ${dollars(estimate)} for ${estimates.size} ${estimates.size === 1 ? 'page' : 'pages'}, ` +
      `at ${method.model} list prices checked on ${PRICE_LIST.checkedOn}. ` +
      'Every page is counted as a Table sheet read twice and translated; a drawing costs less.',
  );
  if (estimate > limit) {
    throw new ReadCatalogError(
      `The estimate, ${dollars(estimate)}, is above the limit of ${dollars(limit)}. Nothing ` +
        'was read. Give a higher limit, or fewer pages with --pages.',
    );
  }
  print(`Limit: ${dollars(limit)}.`);

  const tokens: Tokens = { input: 0, output: 0 };
  const spend = (used: Tokens): Spent => {
    tokens.input += used.input;
    tokens.output += used.output;
    return spending.spend(used);
  };
  let stopped: CostRecord['stopped'] = null;
  const stopAtLimit = (atMost: number, what = 'the next sheet') => {
    stopped = 'spending-limit';
    print(
      `Stopped: ${what} could cost up to ${dollars(atMost)}, which would pass the limit ` +
        `of ${dollars(limit)} with ${dollars(spending.spent)} spent.`,
    );
  };
  const stopAtUsageLimit = (error: UsageLimitReached) => {
    stopped = 'usage-limit';
    print(`Stopped: ${error.message}`);
  };
  const soFar = (cost: number) => `${dollars(cost)}, ${dollars(spending.spent)} so far.`;

  await mkdir(out, { recursive: true });
  const manifest: ReadingManifest = previous?.manifest ?? {
    model,
    readingMethod: method.name,
    readFrom: basename(options.pdf),
    tavole: [],
  };
  await writeJson(join(out, READING_FILE), manifest);
  const asked: PagesManifest = { pages: [...(previous?.pages.pages ?? [])] };

  const setAside: (ReadCatalogResult['setAside'][number] & { image: Buffer })[] = [];
  const setAsideCosts: CostRecord['setAside'] = [];
  const byTavola = new Map<string, IdentifiedSheet[]>();
  const sheetCosts = new Map<number, SheetCost>();
  const notIdentified: number[] = [];
  const nothing: Spent = { tokens: { input: 0, output: 0 }, cost: 0 };

  for (const page of pages) {
    let identity = known.get(page.page);
    let identification = nothing;

    if (!identity) {
      const atMost = spending.atMost((estimates.get(page.page) as SheetEstimate).identify);
      if (stopped === null && spending.wouldPass(atMost)) {
        stopAtLimit(atMost);
      }
      if (stopped !== null) {
        notIdentified.push(page.page);
        continue;
      }

      let answer;
      try {
        answer = await method.identify(page);
      } catch (error) {
        if (!(error instanceof UsageLimitReached)) {
          throw error;
        }
        stopAtUsageLimit(error);
        notIdentified.push(page.page);
        continue;
      }
      identity = answer.value;
      identification = spend(answer.tokens);
      asked.pages.push({ page: page.page, identity });
      await writeJson(join(out, PAGES_FILE), asked);
    }

    const number = identity.tavola?.trim();
    if (identity.kind === 'other' || !number) {
      const reason =
        identity.kind === 'other'
          ? 'It is neither a drawing nor a Table sheet.'
          : 'Its Tavola number could not be read.';
      setAside.push({ ...page, reason });
      if (identification !== nothing) {
        setAsideCosts.push({ page: page.page, cost: identification.cost, identification });
        print(`Page ${page.page}: set aside. ${soFar(identification.cost)}`);
      }
      continue;
    }

    if (identification !== nothing) {
      print(
        `Page ${page.page}: ${identity.kind === 'drawing' ? 'drawing' : 'Table sheet'} of ` +
          `Tavola ${number}. ${soFar(identification.cost)}`,
      );
    }
    sheetCosts.set(page.page, {
      page: page.page,
      kind: identity.kind,
      cost: identification.cost,
      identification,
      readings: [],
    });
    const upright = await sharp(page.image).rotate(identity.turn).png().toBuffer();
    const sheets = byTavola.get(number) ?? [];
    sheets.push({ page: page.page, image: upright, identity: { ...identity, tavola: number } });
    byTavola.set(number, sheets);
  }

  const finished = new Set<string>();
  const translationCosts = new Map<string, Spent>();
  const costRecord = (): CostRecord => ({
    readingMethod: method.name,
    charged: method.charged,
    run,
    model: method.model,
    priceList: priceListEntry(price),
    limit,
    estimate: rounded(estimate),
    total: rounded(spending.spent),
    stopped,
    tavole: [...byTavola]
      .filter(([number]) => !readBefore(number))
      .map(([number, sheets]) => {
        const costs = sheets.map((sheet) => sheetCosts.get(sheet.page) as SheetCost);
        return {
          number,
          finished: finished.has(number),
          cost: rounded(
            costs.reduce((sum, sheet) => sum + sheet.cost, 0) +
              (translationCosts.get(number)?.cost ?? 0),
          ),
          translation: translationCosts.has(number)
            ? roundedSpent(translationCosts.get(number) as Spent)
            : null,
          sheets: costs.map((sheet) => ({
            ...sheet,
            cost: rounded(sheet.cost),
            identification: roundedSpent(sheet.identification),
            readings: sheet.readings.map((reading) => ({
              ...reading,
              cost: rounded(reading.cost),
            })),
          })),
        };
      }),
    setAside: setAsideCosts.map((sheet) => ({
      ...sheet,
      cost: rounded(sheet.cost),
      identification: roundedSpent(sheet.identification),
    })),
    notIdentified,
  });
  const result: ReadCatalogResult = {
    tavole: [],
    setAside: [],
    tokens,
    notRead: [],
    readBefore: [],
    cost: costRecord(),
  };

  for (const [number, sheets] of byTavola) {
    const [drawing, ...otherDrawings] = sheets.filter((sheet) => sheet.identity.kind === 'drawing');
    const secondDrawings = otherDrawings.map((extra) => ({
      ...extra,
      reason: `A second drawing for Tavola ${number}; the one on page ${drawing?.page} is its Scan.`,
    }));
    if (readBefore(number)) {
      result.readBefore.push(number);
      setAside.push(...secondDrawings);
      continue;
    }
    if (stopped !== null) {
      result.notRead.push(number);
      continue;
    }

    const tables = inFactoryOrder(sheets.filter((sheet) => sheet.identity.kind === 'table'));

    print(
      `Tavola ${number}: ${drawing ? `drawing on page ${drawing.page}` : 'no drawing'}, ` +
        `${tables.length} Table ${tables.length === 1 ? 'sheet' : 'sheets'}` +
        (tables.length > 0 ? ` (${pagesNamed(tables)})` : ''),
    );

    const compared: ComparedSheet[] = [];
    for (const [index, sheet] of tables.entries()) {
      const atMost = spending.readingAtMost(estimates.get(sheet.page) as SheetEstimate);
      if (spending.wouldPass(atMost)) {
        stopAtLimit(atMost);
        break;
      }

      const sheetCost = sheetCosts.get(sheet.page) as SheetCost;
      let first, second;
      try {
        first = await method.readTable(sheet, 1);
        sheetCost.readings.push({ reading: 1, ...spend(first.tokens) });
        second = await method.readTable(sheet, 2);
        sheetCost.readings.push({ reading: 2, ...spend(second.tokens) });
      } catch (error) {
        if (!(error instanceof UsageLimitReached)) {
          throw error;
        }
        stopAtUsageLimit(error);
        break;
      } finally {
        const readingsCost = sheetCost.readings.reduce((sum, reading) => sum + reading.cost, 0);
        sheetCost.cost = sheetCost.identification.cost + readingsCost;
      }

      const rows = compareReadings(first.value.rows, second.value.rows);
      compared.push({ layout: first.value.layout, ranges: first.value.ranges, rows });
      print(
        `  Table sheet ${index + 1}, page ${sheet.page}: ${rows.length} rows, ` +
          `${rows.filter((row) => row.doubts.length > 0).length} in doubt. ` +
          soFar(sheetCost.cost - sheetCost.identification.cost),
      );
    }
    if (stopped !== null) {
      result.notRead.push(number);
      continue;
    }

    const listings = interpretTable(compared);
    const header = (drawing ?? tables[0])?.identity;
    const titleIt = header?.titleIt?.trim() ?? '';
    const italian = [
      titleIt,
      ...listings.flatMap((listing) => [listing.nameIt, listing.catalogNote]),
    ];
    const toTranslate = translations.missing(italian);
    if (toTranslate.length > 0) {
      const masked = toTranslate.map(maskCodes);
      const texts = masked.map((text) => text.text);
      const atMost = spending.atMost(await method.estimateTranslation(texts));
      if (spending.wouldPass(atMost)) {
        stopAtLimit(atMost, `translating Tavola ${number}`);
        result.notRead.push(number);
        continue;
      }
      let answer;
      try {
        answer = await method.translate(texts);
      } catch (error) {
        if (!(error instanceof UsageLimitReached)) {
          throw error;
        }
        stopAtUsageLimit(error);
        result.notRead.push(number);
        continue;
      }
      const translated = spend(answer.tokens);
      translationCosts.set(number, translated);
      if (answer.value.length !== texts.length) {
        throw new ReadCatalogError(
          `Asked to translate ${texts.length} texts for Tavola ${number}, ${method.name} ` +
            `answered with ${answer.value.length}. Nothing of it was kept.`,
        );
      }
      for (const [index, text] of toTranslate.entries()) {
        translations.record(text, answer.value[index] as string, masked[index]?.codes ?? []);
      }
      print(
        `  Translated ${toTranslate.length} Italian ${toTranslate.length === 1 ? 'text' : 'texts'} ` +
          `into English. ${soFar(translated.cost)}`,
      );
    }

    setAside.push(...secondDrawings);

    const directory = tavolaDirectory(number);
    await writeTavola(join(out, directory), {
      number,
      readingMethod: method.name,
      drawing: drawing ?? null,
      tables,
      listings,
      translations,
      machineTranslations: translations.of(italian),
    });

    const inDoubt = listings.filter((listing) => listing.doubts.length > 0).length;
    const tavolaCost =
      sheets.reduce((sum, sheet) => sum + (sheetCosts.get(sheet.page) as SheetCost).cost, 0) +
      (translationCosts.get(number)?.cost ?? 0);
    print(
      `  ${listings.length} Listings, ${inDoubt} in doubt. Tavola ${number} ` +
        `${method.charged ? 'cost' : 'would have cost'} ${dollars(tavolaCost)}.`,
    );
    result.tavole.push({ number, directory, listings: listings.length, inDoubt });
    finished.add(number);

    // After every Tavola, so a run that stops part-way leaves a directory that loads what it read.
    manifest.tavole.push(directory);
    await writeJson(join(out, READING_FILE), manifest);
    await writeJson(join(out, costFileName), costRecord());
  }

  await writeJson(join(out, READING_FILE), manifest);
  await writeSetAside(out, setAside);
  for (const sheet of setAside) {
    print(`Set aside: page ${sheet.page}. ${sheet.reason}`);
  }
  result.setAside = setAside.map(({ page, reason }) => ({ page, reason }));
  result.cost = costRecord();
  await writeJson(join(out, costFileName), result.cost);

  if (result.readBefore.length > 0) {
    print(`Read before, and not again: Tavola ${result.readBefore.join(', ')}.`);
  }
  if (result.notRead.length > 0) {
    print(`Not read: Tavola ${result.notRead.join(', ')}.`);
  }
  if (notIdentified.length > 0) {
    print(`Not looked at: ${pagesNamed(notIdentified.map((page) => ({ page })))}.`);
  }
  print(
    `Read by ${method.name}: ${tokens.input.toLocaleString('en-GB')} tokens in, ` +
      `${tokens.output.toLocaleString('en-GB')} out.`,
  );
  print(
    (method.charged
      ? `Cost ${dollars(spending.spent)}`
      : `Would have cost ${dollars(spending.spent)} at list prices, and was not charged`) +
      `, estimated at ${dollars(estimate)}, within a limit of ${dollars(limit)}. ` +
      `Recorded in ${costFileName}.`,
  );
  print(`Written to ${out}. Correct ${LISTINGS_FILE} where it needs it, then load it:`);
  print(`  pnpm archive:load -- --source ${out}`);
  if (stopped !== null) {
    print('To read the rest, run the same command again with --resume and a limit for the rest.');
  }

  return result;
}

function roundedSpent(spent: Spent): Spent {
  return { ...spent, cost: rounded(spent.cost) };
}

/**
 * The factory's own order where every sheet carries a readable *Foglio N°*, and the PDF's where
 * one does not — the foglio is provenance, and a guess at it is no better than the page.
 */
function inFactoryOrder(sheets: IdentifiedSheet[]): IdentifiedSheet[] {
  const fogli = sheets.map((sheet) => numericPrefixOf(sheet.identity.foglio ?? ''));
  if (fogli.some((foglio) => foglio === null)) {
    return sheets;
  }
  return sheets
    .map((sheet, index) => ({ sheet, foglio: fogli[index] as number }))
    .sort((a, b) => a.foglio - b.foglio)
    .map(({ sheet }) => sheet);
}

async function writeTavola(
  directory: string,
  tavola: {
    number: string;
    readingMethod: string;
    drawing: IdentifiedSheet | null;
    tables: IdentifiedSheet[];
    listings: ReadListing[];
    translations: Translations;
    machineTranslations: MachineTranslation[];
  },
): Promise<void> {
  const { number, readingMethod, drawing, tables, listings, translations } = tavola;
  await mkdir(directory, { recursive: true });

  const header = (drawing ?? tables[0])?.identity;
  const titleIt = header?.titleIt?.trim() ?? '';
  const manifest: TavolaManifest = {
    number,
    titleIt,
    titleEn: translations.english(titleIt),
    catalogSection: header?.sezione ?? null,
    catalogGroup: header?.gruppo ?? null,
    catalogSubgroup: header?.sottogruppo ?? null,
    readingMethod,
    scan: drawing ? SCAN_FILE : null,
    tableSheets: tables.map((sheet, index) => ({
      file: tableSheetFile(index + 1),
      page: sheet.page,
      foglio: sheet.identity.foglio,
    })),
    machineTranslations: tavola.machineTranslations,
  };

  if (drawing) {
    await writeFile(join(directory, SCAN_FILE), drawing.image);
  }
  for (const [index, sheet] of tables.entries()) {
    await writeFile(join(directory, tableSheetFile(index + 1)), sheet.image);
  }
  await writeJson(join(directory, TAVOLA_FILE), manifest);

  const c = LISTING_COLUMNS;
  await writeFile(
    join(directory, LISTINGS_FILE),
    writeSheet(
      Object.values(c),
      listings.map((listing) => ({
        [c.position]: listing.position,
        [c.drawn]: listing.drawn ? 'yes' : 'no',
        [c.catalogNumber]: listing.catalogNumber,
        [c.disegnoOrigine]: listing.disegnoOrigine,
        [c.quantity]: listing.quantity,
        [c.nameIt]: listing.nameIt,
        [c.nameEn]: translations.english(listing.nameIt),
        [c.catalogNote]: listing.catalogNote,
        [c.catalogNoteEn]: translations.english(listing.catalogNote),
        [c.fitmentQualifier]: listing.fitmentQualifier,
        [c.tableSheet]: String(listing.tableSheet),
        [c.doubt]: listing.doubts.join('; '),
        [c.readingNote]: listing.notes.join('; '),
      })),
    ),
    'utf8',
  );
}

async function writeSetAside(
  out: string,
  sheets: { page: number; image: Buffer; reason: string }[],
): Promise<void> {
  const c = SET_ASIDE_COLUMNS;
  const rows: Record<string, string>[] = [];
  if (sheets.length > 0) {
    await mkdir(join(out, SET_ASIDE_DIRECTORY), { recursive: true });
  }
  for (const sheet of sheets) {
    const file = join(SET_ASIDE_DIRECTORY, `page-${sheet.page}.png`);
    await writeFile(join(out, file), sheet.image);
    rows.push({ [c.page]: String(sheet.page), [c.file]: file, [c.reason]: sheet.reason });
  }
  await writeFile(join(out, SET_ASIDE_FILE), writeSheet(Object.values(c), rows), 'utf8');
}

function writeJson(path: string, value: unknown): Promise<void> {
  return writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function pagesNamed(sheets: { page: number }[]): string {
  return `${sheets.length === 1 ? 'page' : 'pages'} ${sheets.map((sheet) => sheet.page).join(', ')}`;
}

/** **The Club's scans never land in the repository** (`AGENTS.md`, ADR 0016). */
function assertOutside(out: string, repositoryRoot: string): void {
  const inside = relative(repositoryRoot, out);
  if (
    inside === '' ||
    (!inside.startsWith('..') && !inside.startsWith(sep) && !/^[A-Za-z]:/.test(inside))
  ) {
    throw new ReadCatalogError(
      `${out} is inside the repository. What is read is the Club's material and stays out of ` +
        'it: give a directory somewhere else, such as ../catalog-reading.',
    );
  }
}

/**
 * A directory already holding something is not one to start reading into: two catalogs in one
 * place are one directory nobody can say the provenance of. Carrying on is `--resume`.
 */
async function assertEmpty(out: string): Promise<void> {
  if (existsSync(out) && (await readdir(out)).length > 0) {
    throw new ReadCatalogError(
      `${out} already holds something. Give an empty or new directory, or carry on reading ` +
        'into it with --resume.',
    );
  }
}

/** What an earlier run in this directory left: the same catalog, for the same car. */
async function previousReading(
  out: string,
  pdf: string,
  model: ReadCatalogOptions['model'],
): Promise<{
  manifest: ReadingManifest;
  pages: PagesManifest;
  run: number;
  translations: MachineTranslation[];
}> {
  const readJson = async (file: string) => {
    try {
      return JSON.parse(await readFile(join(out, file), 'utf8')) as unknown;
    } catch {
      throw new ReadCatalogError(
        `${out} holds no reading to carry on with: its ${file} is missing or unreadable.`,
      );
    }
  };
  const manifest = readingManifestSchema.parse(await readJson(READING_FILE));
  const pages = existsSync(join(out, PAGES_FILE))
    ? pagesManifestSchema.parse(await readJson(PAGES_FILE))
    : { pages: [] };

  if (manifest.readFrom !== basename(pdf)) {
    throw new ReadCatalogError(
      `${out} was read from ${manifest.readFrom}, not ${basename(pdf)}. Carry on with the same PDF.`,
    );
  }
  if (model && (model.brand !== manifest.model.brand || model.name !== manifest.model.name)) {
    throw new ReadCatalogError(
      `${out} is the catalog of the ${manifest.model.brand} ${manifest.model.name}, not the ` +
        `${model.brand} ${model.name}.`,
    );
  }

  const files = await readdir(out);
  let run = 1;
  while (files.includes(costFile(run + 1))) {
    run += 1;
  }
  // What the finished Tavole were translated as, so the rest read the same.
  const translations: MachineTranslation[] = [];
  for (const directory of manifest.tavole) {
    const tavola = tavolaManifestSchema.safeParse(
      await readJson(join(directory, TAVOLA_FILE)).catch(() => null),
    );
    translations.push(...(tavola.success ? tavola.data.machineTranslations : []));
  }
  return { manifest, pages, run, translations };
}

/** The directory holding `pnpm-workspace.yaml`, found by walking up from this file. */
function repositoryRootOf(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(directory, 'pnpm-workspace.yaml'))) {
    const parent = dirname(directory);
    if (parent === directory) {
      throw new ReadCatalogError('Could not find the repository this command belongs to.');
    }
    directory = parent;
  }
  return directory;
}
