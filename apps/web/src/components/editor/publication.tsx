import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import { api, refusalText, type TavolaPublication } from '@/lib/api';
import { writtenOn } from '@/lib/contributions';

/**
 * **An Unchecked drawing, and the one action that ends checking it** (issue #30, ADR 0016).
 *
 * Above the drawing rather than among the Editor's panels below it, because it is the first thing
 * an Editor has to know about this screen — nobody but them can see it — and Publish is the one
 * action the whole comparison is for. Only an Editor is ever sent an Unchecked Tavola, so this
 * asks nobody's role: if it is on the screen, the person reading it may press it.
 *
 * Publishing is allowed whenever an Editor decides, with nothing to confirm: it is their
 * statement, and the record of who made it is what the line after it says.
 */
export function UncheckedBand({ tavolaId, modelId }: { tavolaId: string; modelId: string }) {
  const queryClient = useQueryClient();

  const publish = useMutation({
    mutationFn: () => api.publishTavola(tavolaId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tavola', tavolaId] }),
        queryClient.invalidateQueries({ queryKey: ['model', modelId] }),
        queryClient.invalidateQueries({ queryKey: ['model-progress', modelId] }),
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
        queryClient.invalidateQueries({ queryKey: ['category'] }),
      ]),
  });

  return (
    <section
      aria-labelledby="unchecked"
      className="tavola-unchecked flex flex-wrap items-center justify-between gap-x-8 gap-y-4"
      data-testid="unchecked-band"
    >
      <div className="max-w-measure">
        <h2 id="unchecked" className="text-lg font-semibold">
          Unchecked
        </h2>
        <p className="mt-1 text-pretty text-muted">
          Members can’t see this drawing yet. Compare it with the factory’s sheets, then publish it.
        </p>
      </div>

      <Button variant="primary" disabled={publish.isPending} onClick={() => publish.mutate()}>
        {publish.isPending ? 'Publishing…' : 'Publish'}
      </Button>

      {publish.isError && (
        <div className="basis-full">
          <Refusal>{refusalText(publish.error)}</Refusal>
        </div>
      )}
    </section>
  );
}

/** Who vouched for a Published drawing, and when — said to an Editor, in the archive's voice. */
export function PublishedBy({ publication }: { publication: TavolaPublication }) {
  return (
    <p className="text-sm text-faint" data-testid="published-by">
      Published by {publication.by ?? 'a former member'} on{' '}
      <time dateTime={publication.at}>{writtenOn(publication.at)}</time>.
    </p>
  );
}
