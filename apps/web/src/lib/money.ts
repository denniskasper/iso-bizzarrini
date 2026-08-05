import type { Currency } from '@ricambi/contracts';

/**
 * The four currencies these cars trade in.
 *
 * Written out here because `@ricambi/contracts` is **types only** and may not hold a value — so
 * the list exists twice in this repository by design, once in each build, and this is the copy
 * the browser uses. The API's copy is in `db/schema.ts`, where it is also the check constraint,
 * which is what keeps the two honest: a fifth currency added to one and not the other is refused
 * by the database rather than quietly accepted.
 */
export const CURRENCIES: readonly Currency[] = ['EUR', 'USD', 'GBP', 'CHF'];
