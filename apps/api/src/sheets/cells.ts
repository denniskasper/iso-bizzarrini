import type { Currency, SourceCondition } from '@ricambi/contracts';
import { CURRENCIES } from '../db/schema.js';

/**
 * What the cells of a hand-kept spreadsheet actually contain, and what the archive is willing to
 * make of them.
 *
 * **Every reading here can fail, and failing is the useful part.** These sheets were written by
 * people over years: a quantity column holds `4` and `a.r.` and `2 per side`, a date column
 * holds three formats, a price column holds `€ 24,50`. A loader that quietly turned what it
 * could not read into a null would produce an archive nobody could tell was incomplete — so
 * nothing here guesses, and everything it declines lands in the report with the line it came
 * from (ticket 13: *nothing is dropped silently*).
 */
export type Reading<T> = { ok: true; value: T } | { ok: false; why: string };

const ok = <T>(value: T): Reading<T> => ({ ok: true, value });
const no = (why: string): Reading<never> => ({ ok: false, why });

/** How many are fitted per car. The archive does not invent a `1` where the sheet says nothing. */
export function readQuantity(cell: string): Reading<number> {
  if (/^\d+$/.test(cell)) {
    const value = Number(cell);
    return value > 0 ? ok(value) : no(`a quantity of "${cell}" is not a count`);
  }
  return no(`"${cell}" is not a number of parts per car`);
}

/**
 * Whether the drawing shows the Part.
 *
 * **Read strictly, and a row that cannot be read is refused rather than defaulted.** Several
 * *drawn* Parts at a Position are alternatives, fitted instead of one another; *undrawn* ones
 * are the screws needed as well. A guess here is the wrong parts arriving in the post, which is
 * the one mistake this archive exists to stop a member making.
 */
export function readDrawn(cell: string): Reading<boolean> {
  if (TICK.test(cell) || /^(drawn|disegnato)$/i.test(cell)) {
    return ok(true);
  }
  if (/^(n|no|false|0|undrawn|non disegnato|nd)$/i.test(cell)) {
    return ok(false);
  }
  return no(`"${cell}" says neither drawn nor undrawn`);
}

/** Every way a spreadsheet says yes, written once because two columns here are read for it. */
const TICK = /^(y|yes|x|✓|s[iì]|true|1|•|\*)$/i;

/** A cell in the vehicle block: does this car take the Part, and with what qualification. */
export function readsAsFitted(cell: string): boolean {
  return TICK.test(cell);
}

/**
 * A price, in the currency's minor unit — `24500` is €245.00.
 *
 * The separators are the mess: a German or Italian machine writes `1.234,50` and an English one
 * writes `1,234.50`, and both turn up in one column of one sheet. Whichever separator comes
 * last is the decimal one; a lone separator with three digits behind it is a thousands mark.
 */
export function readPrice(cell: string): Reading<number> {
  const digits = cell.replace(/[^\d.,-]/g, '');
  if (digits === '' || !/\d/.test(digits)) {
    return no(`"${cell}" is not a price`);
  }
  if (digits.startsWith('-')) {
    return no(`"${cell}" is a negative price`);
  }

  const lastComma = digits.lastIndexOf(',');
  const lastDot = digits.lastIndexOf('.');
  const separator = lastComma > lastDot ? ',' : lastDot > lastComma ? '.' : '';

  let whole = digits;
  let fraction = '';
  if (separator !== '') {
    const at = separator === ',' ? lastComma : lastDot;
    const after = digits.slice(at + 1);
    // Three digits behind the only separator is a thousands mark: `1.234` is one thousand
    // two hundred and thirty-four, not one euro twenty-three.
    if (/^\d{3}$/.test(after) && digits.indexOf(separator) === at) {
      whole = digits;
    } else if (/^\d{1,2}$/.test(after)) {
      whole = digits.slice(0, at);
      fraction = after.padEnd(2, '0');
    } else {
      return no(`"${cell}" is not a price`);
    }
  }

  whole = whole.replace(/[.,]/g, '');
  if (!/^\d+$/.test(whole)) {
    return no(`"${cell}" is not a price`);
  }

  const amount = Number(whole) * 100 + Number(fraction || '0');
  return amount > 0 ? ok(amount) : no(`"${cell}" is not a price`);
}

/**
 * Which way round a sheet writes `03/04/2025`. **The plan says, and the report prints it back.**
 *
 * There is no reading of the cell that can tell: on the twelve days a year both orders are
 * valid, a guess is silently a month wrong, and warning about every such row would bury the
 * report in warnings about dates that are almost certainly fine. So it is declared once for the
 * export, like the catalog columns are — a judgement somebody made about a spreadsheet, written
 * down where it stays answerable.
 */
export type DateOrder = 'day-first' | 'month-first';

/**
 * The day a price was seen, as `YYYY-MM-DD`.
 *
 * `YYYY-MM-DD` is read as itself whatever the plan says; everything else is read in the declared
 * order, which defaults to day-first because these sheets are kept in Germany and Italy.
 */
export function readObservedOn(cell: string, order: DateOrder = 'day-first'): Reading<string> {
  const written = splitDate(cell);
  if (!written) {
    return no(`"${cell}" is not a date`);
  }
  if (written.iso) {
    return asDay(cell, written.year, written.first, written.second);
  }

  return order === 'day-first'
    ? asDay(cell, written.year, written.second, written.first)
    : asDay(cell, written.year, written.first, written.second);
}

/**
 * What a **column** of written dates has proved about the order the sheet that holds it writes
 * them in — because a cell reading `31/12` proves it for every other cell beside it.
 *
 * `unproven` is a column in which no single cell settles the question; `contradictory` is one in
 * which two cells settle it opposite ways, which is a sheet somebody has pasted two exports
 * into. Both leave the genuinely ambiguous cells unreadable, which is the point of asking.
 */
export type ProvenDateOrder = DateOrder | 'unproven' | 'contradictory';

export function dateOrderProvenBy(cells: Iterable<string>): ProvenDateOrder {
  let dayFirst = false;
  let monthFirst = false;

  for (const cell of cells) {
    const written = splitDate(cell);
    if (!written || written.iso) {
      continue;
    }

    // Proof is a cell that reads as a date **one way only**. `31/12` is day-first; `12/31` is
    // month-first; `13/13` is neither, and a garbage cell must not be allowed to decide anything.
    const asDayFirst = asDay(cell, written.year, written.second, written.first).ok;
    const asMonthFirst = asDay(cell, written.year, written.first, written.second).ok;
    if (asDayFirst && !asMonthFirst) {
      dayFirst = true;
    }
    if (asMonthFirst && !asDayFirst) {
      monthFirst = true;
    }
  }

  if (dayFirst && monthFirst) {
    return 'contradictory';
  }
  return dayFirst ? 'day-first' : monthFirst ? 'month-first' : 'unproven';
}

/**
 * A day as `YYYY-MM-DD` — **read rather than guessed at**, which is what makes it safe to load a
 * membership roster from somebody else's spreadsheet (ticket 16).
 *
 * `03/04/2027` is the 3rd of April on one machine and the 4th of March on another, and there is
 * no reading of the cell that can tell. The migration's answer is a declaration in its plan file,
 * which is right for one export a person writes a plan for; this is the answer for a file
 * uploaded by an Administrator who is not going to write one.
 *
 * So the file itself is the evidence. A cell that reads only one way reads that way whatever the
 * column says; an ambiguous cell is read in the order the rest of its column has **proved**; and
 * an ambiguous cell in a column that proves nothing is **refused, naming both readings**, because
 * a guess here is a Membership silently a month wrong for as long as anybody has it.
 */
export function readCalendarDay(cell: string, order: ProvenDateOrder): Reading<string> {
  const written = splitDate(cell);
  if (!written) {
    return no(`"${cell}" is not a date`);
  }
  if (written.iso) {
    return asDay(cell, written.year, written.first, written.second);
  }

  const dayFirst = asDay(cell, written.year, written.second, written.first);
  const monthFirst = asDay(cell, written.year, written.first, written.second);

  if (!dayFirst.ok || !monthFirst.ok) {
    // At most one of them is a day, so there is nothing to be ambiguous about. Where neither is,
    // the refusal either of them wrote is the one to hand back.
    return dayFirst.ok ? dayFirst : monthFirst.ok ? monthFirst : dayFirst;
  }

  if (order === 'day-first') {
    return dayFirst;
  }
  if (order === 'month-first') {
    return monthFirst;
  }

  /*
   * Both readings are real days, and the column has not settled which was meant. Say both, in the
   * one spelling that cannot be read two ways, so the fix is to write that cell that way.
   *
   * The two ways a column fails to settle it are **different things to be told**: one where
   * nothing in it happens to prove an order, and one where two cells prove opposite orders — that
   * second is a sheet somebody has pasted two exports into, and "nothing says which" would be a
   * plainly false description of a file that says both.
   */
  return no(
    `"${cell}" could be ${dayFirst.value} or ${monthFirst.value}, and ` +
      (order === 'contradictory'
        ? 'that column writes some dates day-first and others month-first'
        : 'nothing else in that column says which') +
      '. Write it as 2027-12-31 and there is nothing left to guess.',
  );
}

/** A date as somebody wrote it, split but not yet decided: which number is the day is the question. */
interface WrittenDate {
  year: string;
  first: string;
  second: string;
  /** `YYYY-MM-DD`, which means what it says whatever any column has proved. */
  iso: boolean;
}

function splitDate(cell: string): WrittenDate | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(cell);
  if (iso) {
    return { year: iso[1] ?? '', first: iso[2] ?? '', second: iso[3] ?? '', iso: true };
  }

  const written = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(cell);
  return written
    ? { year: written[3] ?? '', first: written[1] ?? '', second: written[2] ?? '', iso: false }
    : null;
}

/** The three numbers as a day, or a refusal — 31 February is written down and is not a date. */
function asDay(cell: string, writtenYear: string, month: string, day: string): Reading<string> {
  const year = Number(writtenYear.length === 2 ? `20${writtenYear}` : writtenYear);
  const asMonth = Number(month);
  const asDate = Number(day);
  const date = new Date(Date.UTC(year, asMonth - 1, asDate));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== asMonth - 1 ||
    date.getUTCDate() !== asDate
  ) {
    return no(`"${cell}" is not a day of any month`);
  }

  return ok(
    `${String(year).padStart(4, '0')}-${String(asMonth).padStart(2, '0')}-${String(asDate).padStart(2, '0')}`,
  );
}

/**
 * The currency a price is in, where the sheet has a column for it rather than the plan naming
 * one for the whole column group.
 *
 * **Read like every other cell and never trusted as typed.** The four currencies are a check
 * constraint in the database, so a cell reading `Euro` or `€` that was passed through would not
 * be a bad row — it would be a rejected `INSERT` inside the migration's single transaction, and
 * therefore the whole archive rolled back with no report written at all.
 */
export function readCurrency(cell: string): Reading<Currency> {
  const symbols: Record<string, Currency> = { '€': 'EUR', $: 'USD', '£': 'GBP' };
  const named = symbols[cell] ?? (cell.toUpperCase() as Currency);

  return CURRENCIES.includes(named)
    ? ok(named)
    : no(`"${cell}" is not a currency these cars trade in`);
}

/** New old stock, used or reproduction — the first thing a restorer asks about an offer. */
export function readCondition(cell: string): Reading<SourceCondition> {
  if (/^(nos|new old stock|new-old-stock|nuovo|neu|new)$/i.test(cell)) {
    return ok('new-old-stock');
  }
  if (/^(used|usato|gebraucht|second hand|secondhand)$/i.test(cell)) {
    return ok('used');
  }
  if (/^(repro|reproduction|riproduzione|nachbau|remade|new manufacture)$/i.test(cell)) {
    return ok('reproduction');
  }
  return no(`"${cell}" is not a condition the archive records`);
}

/**
 * Several references in one cell.
 *
 * **Split on semicolons and newlines only.** A supplier's reference legitimately contains a
 * comma, a slash and a space — `DIN 931 M10 × 45`, `A 123/4` — so splitting on those would
 * invent two parts numbers out of one and there would be no way to tell afterwards.
 */
export function splitReferences(cell: string): string[] {
  return cell
    .split(/[;\n]/)
    .map((reference) => reference.trim())
    .filter((reference) => reference !== '');
}

/** Position numbers a cell names — `207`, `210 S`, and lists of them. */
export function splitPositionNumbers(cell: string): string[] {
  return cell
    .split(/[,;\n]/)
    .map((number) => number.trim())
    .filter((number) => number !== '');
}

/**
 * What a Sub-Assembly's cell covers: numbers as printed, and ranges of them.
 *
 * A range is written `207-211` in every sheet anybody keeps, with whichever dash was to hand.
 * It is resolved against the numbers that actually exist on that sheet rather than expanded
 * arithmetically, so a range across `210 S` takes it in and a range over numbers nobody has
 * recorded yet does not invent them.
 */
export type PositionSpan = { from: number; to: number } | { number: string };

export function readPositionSpans(cell: string): PositionSpan[] {
  return splitPositionNumbers(cell).map((token) => {
    const range = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(token);
    if (!range) {
      return { number: token };
    }
    const from = Number(range[1]);
    const to = Number(range[2]);
    return from <= to ? { from, to } : { from: to, to: from };
  });
}
