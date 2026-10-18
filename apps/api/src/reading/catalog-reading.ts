import sharp from 'sharp';
import { numericPrefixOf } from '../catalog/naming.js';
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
import { batchesOf, estimatePage } from './estimate.js';
import { cropsOf, findNumbers } from './find-numbers.js';
import { interpretTable, type ComparedSheet } from './interpret.js';
import { markDoubts, proposeMarks, type MarkDoubt, type ProposedMark } from './marks.js';
import { PRICE_LIST, priceOf } from './price-list.js';
import {
  UsageLimitReached,
  type NumberReading,
  type ReadingMethod,
  type SheetEstimate,
  type SheetIdentity,
  type SheetImage,
  type Tokens,
} from './reading-method.js';
import type { FinishedTavola, ReadingStore, SetAsidePage } from './reading-store.js';
import { Translations, maskCodes } from './translation.js';

/**
 * **The reading of a catalog** (ADR 0017), wherever its progress is kept (`reading-store.ts`).
 *
 * Every page is first asked what it is and whose. A sheet belongs to the Tavola printed on it and
 * never to the page it follows — the scans are out of order — and one whose number cannot be read
 * is set aside for a person rather than guessed. Each sheet is turned upright the way its headings
 * read. Then every Table sheet is read twice, independently, the two Readings are compared, and
 * what the factory meant by its dashes, repeats and ranges is worked out once, here. The numbers on
 * the drawing are found from its ink and read a crop at a time, and become proposed Marks
 * (`find-numbers.ts`, `marks.ts`). Last, the Tavola's Italian is put into English, as a Machine
 * translation (`translation.ts`).
 *
 * Nothing is sent to be read before the whole run has been estimated and found within the limit
 * it was given, and nothing is sent that could take it past that limit (`cost.ts`).
 */
export interface CatalogReadingOptions {
  method: ReadingMethod;
  /** The pages of the catalog to read, in order. */
  pages: AsyncIterable<SheetImage>;
  /**
   * The most the run may cost, in dollars. There is no default, so nobody spends by accident:
   * a run without one does not start.
   */
  limit: number | undefined;
  store: ReadingStore;
  /** Where each line of the running report goes. */
  print: (line: string) => void;
}

export interface CatalogReading {
  tavole: {
    number: string;
    listings: number;
    inDoubt: number;
    marks: number;
    /** Positions listed with no Mark, and Marks for a number listed nowhere. */
    markDoubts: number;
  }[];
  setAside: { page: number; reason: string }[];
  tokens: Tokens;
  /**
   * Tavole the run stopped before finishing, because the next sheet could have passed the limit or
   * the subscription's usage limit was reached.
   */
  notRead: string[];
  /** Tavole an earlier run finished, which this one left alone. */
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

export async function readCatalogInto(options: CatalogReadingOptions): Promise<CatalogReading> {
  const { method, print, limit, store } = options;
  const done = await store.done();

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
  const run = done.run;

  print(
    `Reading with ${method.name}: ` +
      (method.charged
        ? 'billed per use.'
        : 'not charged. Its cost is what it would have been at list prices.'),
  );

  // What earlier runs already found and finished, which is not asked again.
  const known = new Map(done.pages.map(({ page, identity }) => [page, identity]));
  const finishedBefore = new Set(done.tavole);
  const translations = new Translations(done.translations);
  const readBefore = (number: string) => finishedBefore.has(number);
  const stillToRead = (identity: SheetIdentity) => {
    const number = identity.tavola?.trim();
    return identity.kind !== 'other' && !!number && !readBefore(number);
  };

  // Before anything is sent to be read: every page still to be asked about, counted, and the whole
  // run estimated.
  const pages: SheetImage[] = [];
  for await (const page of options.pages) {
    pages.push(page);
  }
  const estimates = new Map<number, SheetEstimate>();
  let estimate = 0;
  for (const page of pages) {
    const identity = known.get(page.page);
    if (identity && !stillToRead(identity)) {
      continue;
    }
    const { sheet, cost } = await estimatePage(method, spending, page, identity);
    estimates.set(page.page, sheet);
    estimate += cost;
  }
  print(
    `Estimated at ${dollars(estimate)} for ${estimates.size} ${estimates.size === 1 ? 'page' : 'pages'}, ` +
      `at ${method.model} list prices checked on ${PRICE_LIST.checkedOn}. ` +
      'Every page is counted as whichever costs more: a Table sheet read twice and translated, ' +
      'or a drawing with its numbers read.',
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

  await store.started({ readingMethod: method.name });

  const setAside: SetAsidePage[] = [];
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
      await store.pageFound(page.page, identity);
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
      numbers: [],
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
            numbers: sheet.numbers.map(roundedSpent),
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
  const result: CatalogReading = {
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

    let marks: ProposedMark[] = [];
    let doubts: MarkDoubt[] = [];
    if (drawing) {
      const sheetCost = sheetCosts.get(drawing.page) as SheetCost;
      const readings: NumberReading[] = [];
      const found = await findNumbers(drawing.image);
      for (const batch of batchesOf(await cropsOf(drawing.image, found))) {
        const atMost = spending.atMost(await method.estimateNumbers(batch));
        if (spending.wouldPass(atMost)) {
          stopAtLimit(atMost, `reading the numbers on the drawing of Tavola ${number}`);
          break;
        }
        try {
          const answer = await method.readNumbers(batch);
          sheetCost.numbers.push(spend(answer.tokens));
          readings.push(...answer.value);
        } catch (error) {
          if (!(error instanceof UsageLimitReached)) {
            throw error;
          }
          stopAtUsageLimit(error);
          break;
        } finally {
          sheetCost.cost =
            sheetCost.identification.cost +
            sheetCost.numbers.reduce((sum, request) => sum + request.cost, 0);
        }
      }
      if (stopped !== null) {
        result.notRead.push(number);
        continue;
      }
      marks = proposeMarks(found, readings);
      doubts = markDoubts(listings, marks);
      print(
        `  Drawing, page ${drawing.page}: ${marks.length} ${marks.length === 1 ? 'Mark' : 'Marks'} ` +
          `proposed from ${found.candidates.length} ${found.candidates.length === 1 ? 'candidate' : 'candidates'}, ` +
          `${doubts.length} ${doubts.length === 1 ? 'Position' : 'Positions'} in doubt between ` +
          `the drawing and the table. ${soFar(sheetCost.cost - sheetCost.identification.cost)}`,
      );
    }

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

    const tavola: FinishedTavola = {
      number,
      titleIt,
      titleEn: translations.english(titleIt),
      catalogSection: header?.sezione ?? null,
      catalogGroup: header?.gruppo ?? null,
      catalogSubgroup: header?.sottogruppo ?? null,
      readingMethod: method.name,
      scan: drawing ? { page: drawing.page, image: drawing.image } : null,
      tableSheets: tables.map((sheet) => ({
        page: sheet.page,
        image: sheet.image,
        foglio: sheet.identity.foglio,
      })),
      listings: listings.map((listing) => ({
        ...listing,
        nameEn: translations.english(listing.nameIt),
        catalogNoteEn: translations.english(listing.catalogNote),
      })),
      marks,
      doubts,
      machineTranslations: translations.of(italian),
    };
    await store.tavolaFinished(tavola);

    const inDoubt = listings.filter((listing) => listing.doubts.length > 0).length;
    const tavolaCost =
      sheets.reduce((sum, sheet) => sum + (sheetCosts.get(sheet.page) as SheetCost).cost, 0) +
      (translationCosts.get(number)?.cost ?? 0);
    print(
      `  ${listings.length} Listings, ${inDoubt} in doubt. Tavola ${number} ` +
        `${method.charged ? 'cost' : 'would have cost'} ${dollars(tavolaCost)}.`,
    );
    result.tavole.push({
      number,
      listings: listings.length,
      inDoubt,
      marks: marks.length,
      markDoubts: doubts.length,
    });
    finished.add(number);

    // After every Tavola, so a run that stops part-way has kept what it read, and what it cost.
    await store.costed(costRecord());
  }

  for (const sheet of setAside) {
    print(`Set aside: page ${sheet.page}. ${sheet.reason}`);
  }
  result.setAside = setAside.map(({ page, reason }) => ({ page, reason }));
  result.cost = costRecord();
  await store.ended({ cost: result.cost, setAside });

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

function pagesNamed(sheets: { page: number }[]): string {
  return `${sheets.length === 1 ? 'page' : 'pages'} ${sheets.map((sheet) => sheet.page).join(', ')}`;
}
