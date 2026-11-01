import type { SpendingPurpose } from '@ricambi/contracts';
import { gte, sql } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import { monthlySpending } from '../db/schema.js';

/** One amount of the record: what was spent in a month, on one purpose, billed or not. */
export interface SpendingAmount {
  /** `YYYY-MM`, the calendar month in UTC. */
  month: string;
  purpose: SpendingPurpose;
  billed: boolean;
  microUsd: number;
}

/**
 * **The one record of spending by month** (issue #189), read. It is written by what spends, in
 * the same transaction as what it spent on, through `addSpending`, and never reduced.
 */
export interface SpendingRepository {
  /** Every amount from `month` (`YYYY-MM`) on. */
  since(month: string): Promise<SpendingAmount[]>;
}

/** What one request cost, added to its month. Only ever added to. */
export async function addSpending(db: DbSession, amount: SpendingAmount): Promise<void> {
  const { month, purpose, billed, microUsd } = amount;
  await db
    .insert(monthlySpending)
    .values({ month, purpose, billed, estimatedCostMicroUsd: microUsd })
    .onConflictDoUpdate({
      target: [monthlySpending.month, monthlySpending.purpose, monthlySpending.billed],
      set: {
        estimatedCostMicroUsd: sql`${monthlySpending.estimatedCostMicroUsd} + ${microUsd}`,
      },
    });
}

export function createSpendingRepository(db: DbSession): SpendingRepository {
  return {
    async since(month) {
      const rows = await db.select().from(monthlySpending).where(gte(monthlySpending.month, month));
      return rows.map((row) => ({
        month: row.month,
        purpose: row.purpose,
        billed: row.billed,
        microUsd: row.estimatedCostMicroUsd,
      }));
    },
  };
}
