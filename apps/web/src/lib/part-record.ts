import type { Currency, EquivalentKind, ObservedPrice, SourceCondition } from '@/lib/api';

/**
 * The words and figures the three collections are read in.
 *
 * **The label maps are `Record`s over the contract's own unions**, which is what makes them
 * exhaustive: a fifth kind of Equivalent added to `@ricambi/contracts` stops this file
 * compiling rather than rendering as a hyphenated slug on a member's screen.
 */

/** Written as a restorer would say them, from the original supplier outwards to the scrapyard. */
export const EQUIVALENT_KIND_LABELS: Record<EquivalentKind, string> = {
  'oe-supplier': 'Original supplier',
  oem: 'Another manufacturer',
  'industry-standard': 'Industry standard',
  'donor-vehicle': 'Donor vehicle',
};

/** The first thing a restorer asks about anything offered for sale. */
export const SOURCE_CONDITION_LABELS: Record<SourceCondition, string> = {
  'new-old-stock': 'New old stock',
  used: 'Used',
  reproduction: 'Reproduction',
};

/** Where these cars actually trade. The same four the archive will store, in the same order. */
export const CURRENCIES: readonly Currency[] = ['EUR', 'USD', 'GBP', 'CHF'];

/**
 * **English, and therefore `en-GB` rather than whatever the browser is set to.** Ricambi is one
 * language (`AGENTS.md`), and a price that renders `€250.00` for one member and `250,00 €` for
 * the next is two members reading the same archive differently — and quoting it differently to
 * each other.
 */
const LOCALE = 'en-GB';

/** €250.00. The minor units the archive stores, put back together for reading. */
export function formatPrice(price: ObservedPrice): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: price.currency }).format(
    price.amount / 100,
  );
}

/**
 * *2 November 2025* — spelled out, because this date is the whole reason the price beside it can
 * be trusted and a member should not have to decode `02/11/25` to work out how old it is.
 *
 * Read and written in UTC. The archive stores a plain `YYYY-MM-DD`, and letting a browser west
 * of Greenwich parse it as local midnight would print the day before.
 */
export function formatObservedOn(observedOn: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${observedOn}T00:00:00Z`));
}

/** What a date field may not go past. The archive refuses a later one; this is the near warning. */
export function todayInTheBrowser(): string {
  return new Date().toISOString().slice(0, 10);
}
