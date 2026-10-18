import { PRICE_LIST, type ModelPrice } from './price-list.js';
import type { RequestEstimate, SheetEstimate, SheetKind, Tokens } from './reading-method.js';

/**
 * **What a run costs, and the limit it may not pass** (ADR 0016, issue #37).
 *
 * Every figure is the token counts the responses report, multiplied by the price list kept in the
 * repository. Before each sheet is sent, the most that sheet could cost is set against what is
 * left of the limit, so the limit is never passed: a run stops a sheet early rather than one late.
 */
export class Spending {
  spent = 0;

  constructor(
    readonly limit: number,
    private readonly price: ModelPrice,
  ) {}

  costOf(tokens: Tokens): number {
    return (
      (tokens.input * this.price.inputPerMillion + tokens.output * this.price.outputPerMillion) /
      1_000_000
    );
  }

  expected(request: RequestEstimate): number {
    return this.costOf({ input: request.input, output: request.output });
  }

  atMost(request: RequestEstimate): number {
    return this.costOf({ input: request.input, output: request.outputAtMost });
  }

  /**
   * Each page as whichever it would cost more as: a Table sheet, asked what it is, read twice and
   * translated, or a drawing, asked what it is and its numbers read.
   */
  estimateOf(sheet: SheetEstimate, numbers: RequestEstimate[]): number {
    return this.expected(sheet.identify) + Math.max(this.readingOf(sheet), this.numbersOf(numbers));
  }

  /** A drawing's numbers, read a request at a time. */
  numbersOf(numbers: RequestEstimate[]): number {
    return numbers.reduce((sum, request) => sum + this.expected(request), 0);
  }

  /** A Table sheet already placed: read twice, and translated. */
  readingOf(sheet: SheetEstimate): number {
    return 2 * this.expected(sheet.reading) + this.expected(sheet.translation);
  }

  /** The most a Table sheet could cost once placed: both Readings and its translation. */
  readingAtMost(sheet: SheetEstimate): number {
    return 2 * this.atMost(sheet.reading) + this.atMost(sheet.translation);
  }

  wouldPass(atMost: number): boolean {
    return this.spent + atMost > this.limit;
  }

  spend(tokens: Tokens): Spent {
    const cost = this.costOf(tokens);
    this.spent += cost;
    return { tokens, cost };
  }
}

export interface Spent {
  tokens: Tokens;
  cost: number;
}

export interface SheetCost {
  page: number;
  kind: Exclude<SheetKind, 'other'>;
  cost: number;
  identification: Spent;
  readings: (Spent & { reading: 1 | 2 })[];
  /** On a drawing, each request that read the numbers on it. Empty on a Table sheet. */
  numbers: Spent[];
}

/** What `cost.json` holds: what the Club is shown. Dollars throughout. */
export interface CostRecord {
  readingMethod: string;
  /**
   * Whether the run was billed. One read on a subscription was not: its figures are what it would
   * have cost at the price list, and its limit was held to those same figures.
   */
  charged: boolean;
  /** 1 for the run that started the directory, then one more for each run resumed in it. */
  run: number;
  model: string;
  priceList: ModelPrice & { currency: string; checkedOn: string; source: string };
  limit: number;
  estimate: number;
  total: number;
  /**
   * Why the run stopped before it had read everything: the next sheet could have passed the
   * spending limit, or the subscription's usage limit was reached. `null` where it did not stop.
   */
  stopped: 'spending-limit' | 'usage-limit' | null;
  tavole: {
    number: string;
    finished: boolean;
    cost: number;
    sheets: SheetCost[];
    /** Its Italian put into English, once its sheets were read. `null` where nothing was sent. */
    translation: Spent | null;
  }[];
  /**
   * Pages this run asked about that went into no Tavola. They were asked what they are, and that
   * cost something.
   */
  setAside: { page: number; cost: number; identification: Spent }[];
  /** Pages never asked what they are, because the run stopped first. They cost nothing. */
  notIdentified: number[];
}

export function priceListEntry(price: ModelPrice): CostRecord['priceList'] {
  return {
    ...price,
    currency: PRICE_LIST.currency,
    checkedOn: PRICE_LIST.checkedOn,
    source: PRICE_LIST.source,
  };
}

/** Exact enough for a record a person adds up: to a ten-thousandth of a cent. */
export function rounded(dollars: number): number {
  return Math.round(dollars * 1_000_000) / 1_000_000;
}

export function dollars(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
