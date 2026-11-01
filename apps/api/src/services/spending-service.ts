import type {
  MonthlyLimitLeftResponse,
  SpendingMonth,
  SpendingPurpose,
  SpendingResponse,
} from '@ricambi/contracts';
import { SPENDING_PURPOSES } from '../db/schema.js';
import type { Clock } from '../platform/clock.js';
import { monthOf, type SpendingRepository } from '../repositories/spending-repository.js';

/** How many calendar months Spending shows, this one included. */
const MONTHS_SHOWN = 12;

export interface SpendingService {
  read(): Promise<SpendingResponse>;
  /**
   * What is left of this month's Monthly limit (issue #192), for starting a Catalog run: nothing
   * said without a limit, or where the Reading method is not billed.
   */
  left(): Promise<MonthlyLimitLeftResponse>;
}

/**
 * **What Ricambi has spent on Claude** (issue #189), against the Monthly limit it is told: the
 * last twelve calendar months from the one record of spending by month, each split by what it
 * was for. Estimates at list prices, as they were recorded; the bill is the Console's.
 */
export function createSpendingService(dependencies: {
  clock: Clock;
  spendingRepository: SpendingRepository;
  /** `ANTHROPIC_MONTHLY_LIMIT_USD`, or null where Ricambi is not told it. */
  monthlyLimitUsd: number | null;
  /**
   * Whether what this system spends on Claude is billed, rather than only priced: it reads or
   * converses with an API key. Said of a month in which nothing was recorded.
   */
  billedHere: boolean;
  /** Whether the Reading method bills each request, rather than only pricing it. */
  readingBilled: boolean;
}): SpendingService {
  const { clock, spendingRepository, monthlyLimitUsd, billedHere, readingBilled } = dependencies;

  return {
    async read() {
      const now = clock.now();
      const names = Array.from({ length: MONTHS_SHOWN }, (_, back) =>
        monthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))),
      );
      const amounts = await spendingRepository.since(names[MONTHS_SHOWN - 1] as string);

      const months = names.map((name): SpendingMonth => {
        const inMonth = amounts.filter((amount) => amount.month === name);
        const byPurpose = Object.fromEntries(
          SPENDING_PURPOSES.map((purpose) => [
            purpose,
            dollars(
              inMonth
                .filter((amount) => amount.purpose === purpose)
                .reduce((sum, amount) => sum + amount.microUsd, 0),
            ),
          ]),
        ) as Record<SpendingPurpose, number>;
        return {
          month: name,
          byPurpose,
          totalUsd: dollars(inMonth.reduce((sum, amount) => sum + amount.microUsd, 0)),
          billed: inMonth.length === 0 ? billedHere : inMonth.some((amount) => amount.billed),
        };
      });

      return { thisMonth: months[0] as SpendingMonth, months, monthlyLimitUsd };
    },

    async left() {
      if (monthlyLimitUsd === null || !readingBilled) {
        return { left: null };
      }
      const month = monthOf(clock.now());
      const billed = (await spendingRepository.since(month))
        .filter((amount) => amount.month === month && amount.billed)
        .reduce((sum, amount) => sum + amount.microUsd, 0);
      // In whole millionths, so the rest is as exact as the figures it is worked out from.
      const limit = Math.round(monthlyLimitUsd * 1_000_000);
      return {
        left: {
          month,
          monthlyLimitUsd,
          spentUsd: dollars(billed),
          leftUsd: dollars(Math.max(0, limit - billed)),
        },
      };
    },
  };
}

function dollars(microUsd: number): number {
  return microUsd / 1_000_000;
}
