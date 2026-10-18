import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import { refusalText } from '@/lib/api';
import { useReadAgain, useReadAgainFrom } from '@/lib/readings';

/**
 * **Reading one Unchecked Tavola again** (issue #61), for an Administrator, where a Catalog run
 * read it badly. Quiet beside Publish, which stays the band's one primary action: pressing this
 * spends nothing. It estimates reading only this Tavola's pages of the stored catalog, and the
 * run page that follows is where the limit is given and the reading started.
 *
 * Offered only where a Catalog run read the Tavola, because there is no catalog to read any other
 * from. A Tavola with Contributions on its Positions is refused, and the refusal says why.
 */
export function ReadAgain({ tavolaId }: { tavolaId: string }) {
  const from = useReadAgainFrom(tavolaId);
  const readAgain = useReadAgain();
  const navigate = useNavigate();

  if (!from.data?.runId) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3"
      data-testid="read-again"
    >
      <p className="max-w-measure text-pretty text-muted">
        Read badly? Read this Tavola again from its catalog. It replaces the whole Tavola, and only
        its own pages are read.
      </p>
      <Button
        disabled={readAgain.isPending}
        onClick={() =>
          readAgain.mutate(tavolaId, {
            onSuccess: (data) =>
              void navigate({ to: '/readings/runs/$runId', params: { runId: data.run.id } }),
          })
        }
      >
        {readAgain.isPending ? 'Estimating…' : 'Read again'}
      </Button>
      {readAgain.error && (
        <div className="basis-full">
          <Refusal>{refusalText(readAgain.error)}</Refusal>
        </div>
      )}
    </div>
  );
}
