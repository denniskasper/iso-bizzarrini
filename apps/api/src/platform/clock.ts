/**
 * Time is injected, never read from the system clock in domain code.
 *
 * Membership expiry, the reminder window, term boundaries and the retention sweep all depend
 * on "now", and every one of them is untestable if "now" is a global. Domain code takes a
 * `Clock`; only the composition root and `systemClock` know what the real time is.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/**
 * Today, as `YYYY-MM-DD`, from the injected clock and never the machine's idea of now.
 *
 * It lives here rather than beside whichever service wanted it first, because **membership runs
 * in days**: a term covers its Paid-through date, a payment arrived on a day, and a lapse happens
 * at a boundary rather than at an instant. Every one of those comparisons is a string comparison
 * against this, and two services having written it out separately is two places for the timezone
 * to be decided differently.
 */
export function today(clock: Clock): string {
  return clock.now().toISOString().slice(0, 10);
}

/**
 * The same day, a number of years later — **real date arithmetic and not string arithmetic**. A
 * term running to 29 February has no anniversary, and `Date.UTC` rolls it to 1 March rather than
 * producing a day that does not exist.
 */
export function yearsOn(day: string, years: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year + years, month - 1, date)).toISOString().slice(0, 10);
}

/** The day a number of days from another — backwards for a negative number. */
export function daysOn(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

/**
 * A clock tests (and seeded non-production data) can move about. Advancing it is how expiry,
 * reminder windows and retention are driven.
 */
export class MutableClock implements Clock {
  #current: Date;

  constructor(start: Date) {
    this.#current = new Date(start.getTime());
  }

  now(): Date {
    return new Date(this.#current.getTime());
  }

  setTo(instant: Date): void {
    this.#current = new Date(instant.getTime());
  }

  advanceBy(milliseconds: number): void {
    this.#current = new Date(this.#current.getTime() + milliseconds);
  }

  advanceByDays(days: number): void {
    this.advanceBy(days * 24 * 60 * 60 * 1000);
  }
}
