import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { Refusal } from '@/components/ui/field';
import { api, refusalText } from '@/lib/api';

/**
 * **Typed numbers** (issue #250): a drawing that stands upright while the factory printed its
 * numbers sideways to it. Turning the drawing would only turn the numbers upright and the drawing
 * sideways, so instead every Mark's number is typed upright over the print, for the whole Tavola
 * and for every reader. Nothing is turned and the Scan is left as it is, so it can be switched
 * off again at any time and the factory print is back.
 */
export function TypedNumbersSwitch({ tavolaId, on }: { tavolaId: string; on: boolean }) {
  const id = useId();
  const queryClient = useQueryClient();
  const typeNumbers = useMutation({
    mutationFn: (typed: boolean) => api.typeNumbers(tavolaId, typed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tavola', tavolaId] }),
  });

  return (
    <div className="flex flex-col gap-3" data-testid="typed-numbers">
      <label htmlFor={id} className="flex min-h-control items-center gap-3 text-sm text-muted">
        <input
          id={id}
          type="checkbox"
          data-testid="typed-numbers-switch"
          // What the Editor just asked for, until the Tavola is read back, so the box ticks when
          // it is pressed rather than a moment later.
          checked={typeNumbers.isPending ? typeNumbers.variables : on}
          disabled={typeNumbers.isPending}
          onChange={(event) => typeNumbers.mutate(event.target.checked)}
          className="size-5 accent-accent"
        />
        Type the numbers upright
      </label>
      {typeNumbers.isError && <Refusal>{refusalText(typeNumbers.error)}</Refusal>}
    </div>
  );
}
