import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '@/lib/api';

/**
 * What sits at a number, read once for the two screens that show it.
 *
 * A member reads the Position beside the drawing and an Editor records into it below — the same
 * Listings, from the same address. Naming the query in one place is what keeps them the same
 * cache entry: written out twice, a key drifts, and the Editor's panel would go on showing what
 * was there before their last Part while the panel beside the drawing showed what is.
 */
export function usePositionListings(positionId: string) {
  return useQuery({
    queryKey: keyFor(positionId),
    queryFn: () => api.positionListings(positionId),
  });
}

/** Re-read what sits here, after recording or removing something. */
export function useRereadPosition(positionId: string): () => Promise<void> {
  const queryClient = useQueryClient();

  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: keyFor(positionId) }),
    [queryClient, positionId],
  );
}

function keyFor(positionId: string) {
  return ['position-listings', positionId] as const;
}
