import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import { api, refusalText, type EndedSample, type TavolaSample } from '@/lib/api';
import { writtenOn } from '@/lib/contributions';

/**
 * Showing a Published Tavola to Visitors as a Sample, and opening its number (ADR 0019). The
 * mutation lives here and the page calls it, because the *drawing* is where the number is picked:
 * while an Administrator is picking, pressing a circle opens that number rather than reading it.
 */
export function useShowToVisitors(tavolaId: string, onShown: () => void) {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tavola', tavolaId] }),
      queryClient.invalidateQueries({ queryKey: ['samples'] }),
    ]);

  const show = useMutation({
    mutationFn: (positionId: string) => api.showToVisitors(tavolaId, positionId),
    onSuccess: async () => {
      await refresh();
      onShown();
    },
  });
  const stop = useMutation({
    mutationFn: () => api.stopShowingToVisitors(tavolaId),
    onSuccess: refresh,
  });

  return { show, stop };
}

/**
 * **Whether Visitors see this drawing**, said to an Administrator above it — and the three things
 * they can do about that: show it, open another number, stop showing it.
 *
 * Plain and quiet, in the dashed band the Unchecked state wears, because it is a statement about
 * who sees the sheet rather than something done to it. The screen's one champagne action stays
 * the drawing's; showing it to the public is an outline, chosen deliberately rather than pressed
 * in passing.
 */
export function ShowToVisitors({
  sample,
  ended,
  picking,
  onPick,
  onCancel,
  actions,
}: {
  sample: TavolaSample | null;
  /** Whether it stopped being shown by itself, because its open number was removed. */
  ended: EndedSample | null;
  /** Whether a press on a circle is choosing the open number just now. */
  picking: boolean;
  onPick: () => void;
  onCancel: () => void;
  actions: ReturnType<typeof useShowToVisitors>;
}) {
  const { show, stop } = actions;
  const failed = show.error ?? stop.error;

  return (
    <section
      aria-labelledby="visitors"
      className="tavola-unchecked flex flex-wrap items-start justify-between gap-x-8 gap-y-4"
      data-testid="show-to-visitors"
    >
      <div className="max-w-measure">
        <h2 id="visitors" className="text-lg font-semibold">
          Visitors
        </h2>
        {picking ? (
          <p className="mt-1 text-pretty" data-testid="picking-open-number">
            Click the number on the drawing that Visitors may read. Every other number stays locked.
          </p>
        ) : sample ? (
          <p className="mt-1 text-pretty text-muted" data-testid="sample-shown">
            Shown to Visitors, with number{' '}
            <span className="tabular font-semibold text-text" data-testid="sample-open-number">
              {sample.open.number}
            </span>{' '}
            open. Shown by {sample.markedBy ?? 'a former member'} on{' '}
            <time dateTime={sample.markedAt}>{writtenOn(sample.markedAt)}</time>.
          </p>
        ) : ended ? (
          <p className="mt-1 text-pretty" data-testid="sample-ended">
            Visitors stopped seeing this drawing on{' '}
            <time dateTime={ended.endedAt}>{writtenOn(ended.endedAt)}</time>: number{' '}
            <span className="tabular font-semibold">{ended.openNumber}</span>, the one open to them,
            was removed. Show it again with another number open, or dismiss this.
          </p>
        ) : (
          <p className="mt-1 text-pretty text-muted">
            Visitors can’t see this drawing. Show it with one number open, so they can judge the
            archive by it.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {picking ? (
          <Button onClick={onCancel} disabled={show.isPending}>
            {show.isPending ? 'Opening…' : 'Cancel'}
          </Button>
        ) : sample ? (
          <>
            <Button onClick={onPick}>Open another number</Button>
            <Button
              variant="ghost"
              disabled={stop.isPending}
              onClick={() => stop.mutate()}
              title="Visitors stop seeing this drawing, and its public copy is deleted."
            >
              {stop.isPending ? 'Stopping…' : 'Stop showing'}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onPick}>Show to Visitors</Button>
            {ended && (
              <Button variant="ghost" disabled={stop.isPending} onClick={() => stop.mutate()}>
                {stop.isPending ? 'Dismissing…' : 'Dismiss'}
              </Button>
            )}
          </>
        )}
      </div>

      {failed && (
        <div className="basis-full">
          <Refusal>{refusalText(failed)}</Refusal>
        </div>
      )}
    </section>
  );
}
