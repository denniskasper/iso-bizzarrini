import sharp from 'sharp';
import { numericPrefixOf } from '../catalog/naming.js';
import { compareReadings } from './compare.js';
import {
  Spending,
  dollars,
  priceListEntry,
  rounded,
  type CostRecord,
  type SentRequest,
  type SheetCost,
  type Spent,
} from './cost.js';
import { batchesOf, estimatePage, needsAsking } from './estimate.js';
import { bothWays, cropsOf, findNumbers } from './find-numbers.js';
import { interpretTable, type ComparedSheet } from './interpret.js';
import { markDoubts, proposeMarks, type MarkDoubt, type ProposedMark } from './marks.js';
import { PRICE_LIST, priceOf } from './price-list.js';
import {
  ReadingMethodError,
  MonthlyLimitReached,
  UsageLimitReached,
  type NumberReading,
  type ReadingMethod,
  type Answer,
  type SheetEstimate,
  type SheetIdentity,
  type SheetImage,
  type TableReading,
  type Tokens,
  type Turn,
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
  /**
   * Whether a person has asked the run to stop. Asked before every request: the run stops there,
   * cleanly, as it does at its limit (issue #59).
   */
  stopAsked?: () => boolean;
  /**
   * Aborted when the process is going away. Before every request the run throws the reason and
   * tells the store nothing more, so whatever picks the run up carries on from its last step.
   */
  interrupted?: AbortSignal;
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

/** What is still to read is estimated above the limit. Nothing was sent. */
export class EstimateAboveLimit extends ReadCatalogError {
  constructor(
    readonly estimate: number,
    readonly limit: number,
  ) {
    super(
      `The estimate, ${dollars(estimate)}, is above the limit of ${dollars(limit)}. Nothing ` +
        'was read. Give a higher limit, or fewer pages with --pages.',
    );
    this.name = 'EstimateAboveLimit';
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
    throw new EstimateAboveLimit(rounded(estimate), limit);
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
  /** A request the method could not answer stops the run, rather than be asked and paid again. */
  const stopOn = (error: unknown) => {
    if (error instanceof UsageLimitReached) {
      stopped = 'usage-limit';
    } else if (error instanceof MonthlyLimitReached) {
      stopped = 'monthly-limit';
    } else if (error instanceof ReadingMethodError) {
      stopped = 'method-failed';
    } else {
      throw error;
    }
    print(`Stopped: ${error.message}`);
  };
  /**
   * Whether the next request may be sent: not once the run has stopped, or a person has asked it
   * to, and never after the process has begun to go away.
   */
  const mayAsk = (): boolean => {
    options.interrupted?.throwIfAborted();
    if (stopped === null && options.stopAsked?.()) {
      stopped = 'asked';
      print('Stopped: asked to stop.');
    }
    return stopped === null;
  };
  const soFar = (cost: number) => `${dollars(cost)}, ${dollars(spending.spent)} so far.`;

  await store.started({ readingMethod: method.name });

  const setAside: SetAsidePage[] = [];
  const setAsideCosts: CostRecord['setAside'] = [];
  const byTavola = new Map<string, IdentifiedSheet[]>();
  const sheetCosts = new Map<number, SheetCost>();
  const notIdentified: number[] = [];
  const nothing: Spent = { tokens: { input: 0, output: 0 }, cost: 0 };
  const finished = new Set<string>();
  const translationCosts = new Map<string, Spent>();
  let awaiting: SentRequest | null = null;
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
    awaiting,
    cutOff: [],
  });
  /**
   * A request sent, the store told first that it awaits its answer and the most it could cost, so
   * that a run cut off before the answer comes back still counts what it paid for (issue #66).
   */
  const send = async <T>(request: SentRequest, ask: () => Promise<T>): Promise<T> => {
    awaiting = { ...request, cost: rounded(request.cost) };
    await store.costed(costRecord());
    try {
      return await ask();
    } finally {
      awaiting = null;
    }
  };

  for (const page of pages) {
    const before = known.get(page.page);
    let identity = before && !needsAsking(before) ? before : undefined;
    let identification = nothing;

    if (!identity) {
      const atMost = spending.atMost((estimates.get(page.page) as SheetEstimate).identify);
      if (mayAsk() && spending.wouldPass(atMost)) {
        stopAtLimit(atMost);
      }
      if (stopped !== null) {
        notIdentified.push(page.page);
        continue;
      }

      let answer;
      try {
        answer = await send(
          { request: 'identification', page: page.page, tavola: null, reading: null, cost: atMost },
          () => method.identify(page),
        );
      } catch (error) {
        stopOn(error);
        notIdentified.push(page.page);
        continue;
      }
      // Asked again only for which way its numbers read: what it was found to be stands.
      identity = before ? { ...before, numbersTurn: answer.value.numbersTurn } : answer.value;
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
        await store.costed(costRecord());
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
    if (identification !== nothing) {
      await store.costed(costRecord());
    }
  }

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
      const sheetEstimate = estimates.get(sheet.page) as SheetEstimate;
      const atMost = spending.readingAtMost(sheetEstimate);
      if (!mayAsk()) {
        break;
      }
      if (spending.wouldPass(atMost)) {
        stopAtLimit(atMost);
        break;
      }

      const sheetCost = sheetCosts.get(sheet.page) as SheetCost;
      const answers: Answer<TableReading>[] = [];
      try {
        for (const reading of [1, 2] as const) {
          if (!mayAsk()) {
            break;
          }
          const answer = await send(
            {
              request: 'reading',
              page: sheet.page,
              tavola: number,
              reading,
              cost: spending.atMost(sheetEstimate.reading),
            },
            () => method.readTable(sheet, reading),
          );
          sheetCost.readings.push({ reading, ...spend(answer.tokens) });
          answers.push(answer);
        }
      } catch (error) {
        stopOn(error);
      } finally {
        const readingsCost = sheetCost.readings.reduce((sum, reading) => sum + reading.cost, 0);
        sheetCost.cost = sheetCost.identification.cost + readingsCost;
      }
      const [first, second] = answers;
      if (!first || !second) {
        break;
      }
      await store.costed(costRecord());

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
      const counted = () => {
        sheetCost.cost =
          sheetCost.identification.cost +
          sheetCost.numbers.reduce((sum, request) => sum + request.cost, 0);
      };
      // Found and read turned the way its numbers read, which may be a quarter from its headings.
      const identity = drawing.identity;
      let turned = (((identity.numbersTurn ?? identity.turn) - identity.turn + 360) % 360) as Turn;
      let { found, crops } = await numbersOn(drawing.image, turned);
      // Which axis the numbers lie on is the finder's to say, not the identification's: digits
      // only look like digits along their own, so a quarter further round finds far more of them
      // where the identification had the axis wrong, as it did with Tavola 51's sideways numbers.
      const across = ((turned + 90) % 360) as Turn;
      const otherAxis = await numbersOn(drawing.image, across);
      const switched = foundFarMore(otherAxis.found, found);
      if (switched) {
        turned = across;
        ({ found, crops } = otherAxis);
      }
      // Which way a turned number reads is easy to get the wrong way round; shown both ways, the
      // model tells which is upright, and the finder finds the same numbers turned half round.
      if ((turned !== 0 || switched) && crops.length > 0 && mayAsk()) {
        const rows = { page: drawing.page, ...(await bothWays(crops)) };
        const atMost = spending.atMost(await method.estimateOrientation(rows));
        if (spending.wouldPass(atMost)) {
          stopAtLimit(atMost, `reading the numbers on the drawing of Tavola ${number}`);
        } else {
          try {
            const answer = await send(
              {
                request: 'numbers',
                page: drawing.page,
                tavola: number,
                reading: null,
                cost: atMost,
              },
              () => method.orientNumbers(rows),
            );
            sheetCost.numbers.push(spend(answer.tokens));
            if (answer.value === 'half-round') {
              turned = ((turned + 180) % 360) as Turn;
              ({ found, crops } = await numbersOn(drawing.image, turned));
            }
          } catch (error) {
            stopOn(error);
          } finally {
            counted();
          }
          await store.costed(costRecord());
        }
      }
      for (const batch of batchesOf(crops)) {
        const atMost = spending.atMost(await method.estimateNumbers(batch));
        if (!mayAsk()) {
          break;
        }
        if (spending.wouldPass(atMost)) {
          stopAtLimit(atMost, `reading the numbers on the drawing of Tavola ${number}`);
          break;
        }
        try {
          const answer = await send(
            { request: 'numbers', page: drawing.page, tavola: number, reading: null, cost: atMost },
            () => method.readNumbers(batch),
          );
          sheetCost.numbers.push(spend(answer.tokens));
          readings.push(...answer.value);
        } catch (error) {
          stopOn(error);
          break;
        } finally {
          counted();
        }
        await store.costed(costRecord());
      }
      if (stopped !== null) {
        result.notRead.push(number);
        continue;
      }
      marks = proposeMarks(found, readings, turned);
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
      if (!mayAsk()) {
        result.notRead.push(number);
        continue;
      }
      if (spending.wouldPass(atMost)) {
        stopAtLimit(atMost, `translating Tavola ${number}`);
        result.notRead.push(number);
        continue;
      }
      let answer;
      try {
        answer = await send(
          { request: 'translation', page: null, tavola: number, reading: null, cost: atMost },
          () => method.translate(texts),
        );
      } catch (error) {
        stopOn(error);
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

/** A drawing's numbers, found and cut out with it turned `turned` clockwise. */
/**
 * Whether one axis found far more candidates than the other: twice as many and ten more. On the
 * wrong axis the finder still picks up a few strays, such as the title block's figures, so a
 * difference of a handful decides nothing.
 */
function foundFarMore(one: { candidates: unknown[] }, other: { candidates: unknown[] }): boolean {
  const [more, fewer] = [one.candidates.length, other.candidates.length];
  return more >= 2 * fewer && more - fewer >= 10;
}

async function numbersOn(image: Buffer, turned: Turn) {
  const turnedImage = turned === 0 ? image : await sharp(image).rotate(turned).png().toBuffer();
  const found = await findNumbers(turnedImage);
  return { found, crops: await cropsOf(turnedImage, found) };
}
