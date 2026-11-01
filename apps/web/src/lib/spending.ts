import type { SpendingPurpose } from '@ricambi/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** **The provider's Console**, where the bill itself is (issue #189). */
export const CONSOLE_COST_URL = 'https://platform.claude.com/cost';

/** What each purpose is called, in the order Spending lists them. */
export const PURPOSE_NAME: Record<SpendingPurpose, string> = {
  'proposal-conversations': 'Proposals’ conversations',
  'catalog-runs': 'Catalog runs',
};

/**
 * What Ricambi has spent on Claude this month and the eleven before (issue #189). Asked afresh on
 * every visit: it is added to whenever somebody converses, so a figure kept from before is stale.
 */
export function useSpending() {
  return useQuery({ queryKey: ['spending'], queryFn: api.spending, staleTime: 0 });
}

/**
 * What is left of this month's Monthly limit (issue #192), for the screens that start and
 * continue a Catalog run. Asked afresh, as Spending is, since every run and conversation adds to it.
 */
export function useMonthlyLimitLeft() {
  return useQuery({ queryKey: ['spending', 'left'], queryFn: api.monthlyLimitLeft, staleTime: 0 });
}

/** `2026-03` as "March 2026", named the same way in every timezone. */
export function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
