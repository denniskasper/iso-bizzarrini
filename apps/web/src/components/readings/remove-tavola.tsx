import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import { refusalText } from '@/lib/api';
import { useRemoveTavola } from '@/lib/readings';

/**
 * **Removing an Unchecked Tavola** (issue #83), for an Administrator, where a Catalog run read
 * something nobody wants: a practice run, the wrong Model, a page that is not a Tavola. Quieter
 * than Read again beside it, and asked twice, in the way removing a Part is: there is no undo,
 * and the way back is reading its pages again in a new Catalog run.
 *
 * Refused for a Tavola with Contributions on its Positions and while a Catalog run is reading,
 * and the refusal says why where the button was.
 */
export function RemoveTavola({ tavolaId }: { tavolaId: string }) {
  const [asked, setAsked] = useState(false);
  const removeTavola = useRemoveTavola();
  const navigate = useNavigate();

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3"
      data-testid="remove-tavola"
    >
      <p className="max-w-measure text-pretty text-muted">
        Read by mistake? Remove it, with its Positions, Listings and files, and the Parts listed
        nowhere else. Parts also listed on other Tavole stay.
      </p>
      {asked ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={removeTavola.isPending}
            onClick={() =>
              removeTavola.mutate(tavolaId, {
                onSuccess: (data) =>
                  void navigate({ to: '/models/$modelId', params: { modelId: data.modelId } }),
              })
            }
          >
            {removeTavola.isPending ? 'Removing…' : 'Yes, remove it'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setAsked(false);
              removeTavola.reset();
            }}
          >
            Keep it
          </Button>
        </div>
      ) : (
        <Button type="button" variant="ghost" onClick={() => setAsked(true)}>
          Remove this Tavola
        </Button>
      )}
      {removeTavola.error && (
        <div className="basis-full">
          <Refusal>{refusalText(removeTavola.error)}</Refusal>
        </div>
      )}
    </div>
  );
}
