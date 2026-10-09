import { ValidationError } from '../http/errors.js';

/** What the archive stores dates as, and the only thing a date field may send. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A day the archive can read, or a refusal naming what was being asked for.
 *
 * Read back out and compared, because `Date` is generous: it takes the 30th of February and
 * hands over the 2nd of March, and a date nobody wrote is not one to record.
 */
export function readDay(value: string, what: string): string {
  const day = value.trim();
  const parsed = ISO_DATE.test(day) ? Date.parse(`${day}T00:00:00Z`) : Number.NaN;
  if (Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== day) {
    throw new ValidationError(`That is not ${what} the archive can read.`);
  }
  return day;
}
