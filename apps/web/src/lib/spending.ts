import type { SpendingPurpose } from '@ricambi/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** **The provider's Console**, where the bill itself is (issue #189). */
export const CONSOLE_COST_URL = 'https://platform.claude.com/cost';

/** What each purpose is called, in the order Spending lists them. */
export const PURPOSE_NAME: Record<SpendingPurpose, string> = {
  'proposal-conversations': 'Proposals’ conversations',
};

/**
 * What Ricambi has spent on Claude this month and the eleven before (issue #189). Asked afresh on
 * every visit: it is added to whenever somebody converses, so a figure kept from before is stale.
 */
export function useSpending() {
  return useQuery({ queryKey: ['spending'], queryFn: api.spending, staleTime: 0 });
}

/** `2026-03` as "March 2026", named the same way in every timezone. */
export function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
