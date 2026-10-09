import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type RecordPartFromContributionRequest } from '@/lib/api';
import { useSession } from '@/lib/session';

/**
 * What members have sent that nobody has decided — **an Editor's reading of the archive, and
 * nobody else's.**
 *
 * Remembered under who asked, for the reason a member's own waiting words are
 * (`lib/contributions.ts`): this is the one thing in the archive that must never be on the
 * screen of the next person to sign in at the same tab, and a browser cannot show somebody what
 * it has remembered for somebody else.
 */
function useEditor(): string | null {
  const { account, isEditor, mayRead } = useSession();
  return account && isEditor && mayRead ? account.id : null;
}

export function useWaitingContributions() {
  const editorId = useEditor();

  return useQuery({
    queryKey: ['contributions-waiting', editorId] as const,
    queryFn: api.waitingContributions,
    enabled: editorId !== null,
  });
}

/**
 * How many are waiting, for the chrome — asked on its own, so that every screen in the archive
 * does not read the whole queue to print one number. Nought for anybody who is not an Editor,
 * without asking.
 */
export function useWaitingCount(): number {
  const editorId = useEditor();

  const { data } = useQuery({
    queryKey: ['contributions-waiting-count', editorId] as const,
    queryFn: api.waitingCount,
    enabled: editorId !== null,
    /*
     * **Asked again without being asked to**, which nothing else in this archive is. Every other
     * reading changes because the person looking changed it; this one changes because a member
     * somewhere sent something, and an Editor with the archive open all evening has to be told.
     * A minute is soon enough for a queue measured in days, and coming back to the tab asks at
     * once.
     */
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  return editorId === null ? 0 : (data?.waiting ?? 0);
}

/** One thing an Editor does to a waiting Contribution besides correcting the Part. */
export type ReviewAction =
  | { kind: 'decide'; contributionId: string; decision: 'publish' | 'discard' }
  | { kind: 'record-part'; contributionId: string; part: RecordPartFromContributionRequest }
  | { kind: 'promote-photograph'; photographId: string };

/**
 * The three of them as one mutation, because they end the same way: **the archive answers with
 * the queue**, which is put straight where the screen reads it, and then everything else this
 * browser remembers that the action could have changed is read again.
 *
 * That last part is wide on purpose. Publishing changes what members read at a number; recording
 * a Part changes a sheet's index and what sits at a Position; moving a photograph changes the
 * Part wherever it is listed. Working out which applies would be a second copy of rules the
 * archive already keeps.
 */
export function useReviewAction() {
  const queryClient = useQueryClient();
  const editorId = useEditor();

  return useMutation({
    mutationFn: (action: ReviewAction) => {
      if (action.kind === 'decide') {
        return api.decideContribution(action.contributionId, action.decision);
      }
      if (action.kind === 'record-part') {
        return api.recordPartFromContribution(action.contributionId, action.part);
      }
      return api.promoteContributionPhotograph(action.photographId);
    },
    /*
     * A refusal here nearly always means the queue on screen is out of date — another Editor
     * decided this one a moment ago. So it is read again, and what cannot be acted on any more
     * leaves the screen rather than sitting there with live buttons.
     */
    onError: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contributions-waiting'] }),
        queryClient.invalidateQueries({ queryKey: ['contributions-waiting-count'] }),
      ]);
    },
    onSuccess: async (queue) => {
      queryClient.setQueryData(['contributions-waiting', editorId], queue);
      await Promise.all(
        [
          'contributions-waiting-count',
          'position-contributions',
          'position-listings',
          'tavola-listings',
          'part',
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey: [queryKey] })),
      );
    },
  });
}
