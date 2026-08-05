/**
 * Amounts of money, read from what somebody typed and written back the same way.
 *
 * **Every amount in this archive is an integer of the currency's minor unit** — `25000` is
 * €250.00 — so nothing between a keyboard and a screen is ever a float and nothing is ever
 * rounded. Two things need this: what a Part has been seen selling for, and what the Club
 * charges its members. They read a typed figure identically because a treasurer and an Editor
 * type figures identically.
 */

/** Nothing else is an amount: not a range, not "about", not a thousands separator nobody agrees on. */
const AMOUNT = /^(\d{1,9})(?:[.,](\d{1,2}))?$/;

/** What the archive stores dates as, and the only thing a date field may send. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The minor units in `45`, `45.00` or `45,50`, or null where that is not an amount at all. */
export function readAmount(typed: string): number | null {
  const parsed = AMOUNT.exec(typed.trim());
  if (!parsed) {
    return null;
  }

  const [, whole = '0', fraction = ''] = parsed;
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Minor units back into the figure a person reads — always with both decimals. */
export function writeAmount(minorUnits: number): string {
  const whole = Math.trunc(minorUnits / 100);
  const fraction = Math.abs(minorUnits % 100);
  return `${whole}.${String(fraction).padStart(2, '0')}`;
}
