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
    queryKey: atPosition(positionId),
    queryFn: () => api.positionListings(positionId),
  });
}

/**
 * The whole sheet's text — every Part listed on this drawing, at whichever number.
 *
 * Read once for the Tavola rather than once per Position, because it is what a member works
 * *from* (story 46): a list of two hundred numbers that fetched what sits at each of them would
 * be two hundred requests to draw a table of contents. It is also the only thing that knows
 * which numbers have nothing recorded at them, since a Position that appears nowhere in it is
 * one nobody has written anything down about (story 45).
 */
export function useTavolaListings(tavolaId: string) {
  return useQuery({
    queryKey: onTavola(tavolaId),
    queryFn: () => api.tavolaListings(tavolaId),
  });
}

/**
 * Re-read what is listed, after recording or removing something.
 *
 * **Both readings, always**, because they are two views of one fact. Recording a Part into the
 * panel below the drawing changes the sheet's index beside it, and an index that went on saying
 * "not recorded yet" about a number an Editor had just filled in would be the archive
 * contradicting itself on one screen. The Position is optional: removing a *Position* changes
 * the index without there being a Position left to re-read.
 */
export function useRereadListings(tavolaId: string, positionId?: string): () => Promise<void> {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: onTavola(tavolaId) }),
      ...(positionId ? [queryClient.invalidateQueries({ queryKey: atPosition(positionId) })] : []),
    ]);
  }, [queryClient, tavolaId, positionId]);
}

/**
 * Re-read every Position's Parts, after what fits one — or what replaces it, or where it has
 * been available — has changed.
 *
 * **Wider than `useRereadListings` on purpose.** Those three belong to the *Part* and not to
 * its appearance on a drawing (ADR 0001), so correcting one from the panel under Tavola 2
 * corrects it at every number that Part sits at, on every sheet. Invalidating only the Position
 * the Editor happened to be looking at would leave the others in this browser showing a fitment
 * the archive no longer holds.
 */
export function useRereadPart(): () => Promise<void> {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    // The prefix, so every cached Position goes — there is no cheap way to know which of them
    // hold this Part, and there is no expensive one worth having either.
    await queryClient.invalidateQueries({ queryKey: ['position-listings'] });
  }, [queryClient]);
}

function atPosition(positionId: string) {
  return ['position-listings', positionId] as const;
}

function onTavola(tavolaId: string) {
  return ['tavola-listings', tavolaId] as const;
}
