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
