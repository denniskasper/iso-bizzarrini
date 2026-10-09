import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

/**
 * What members have said about a number and the Parts listed at it, read once for the panel
 * beside the drawing — one request for a click, like the Listings it sits under.
 *
 * **The answer is this member's and nobody else's**: it carries what they have sent that is
 * still waiting to be checked. So it is remembered **under who asked**, and that is not tidiness.
 * Signing out marks what this browser remembers as stale without forgetting it, and a member's
 * waiting words remembered under the number alone would be on the screen of the next person to
 * sign in at that tab for as long as the archive took to answer again. Under their own name
 * there is nothing remembered for them to be shown.
 */
export function usePositionContributions(positionId: string) {
  const { account } = useSession();
  const readerId = account?.id ?? null;

  return useQuery({
    queryKey: ['position-contributions', readerId, positionId] as const,
    queryFn: () => api.positionContributions(positionId),
    enabled: readerId !== null,
  });
}

/**
 * Re-read after sending one, at **every** number in this browser's cache and not only the one
 * on screen: a Contribution about a Part is the Part's (ADR 0001), so it is read wherever that
 * Part is listed.
 */
export function useRereadContributions(): () => Promise<void> {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['position-contributions'] });
  }, [queryClient]);
}
