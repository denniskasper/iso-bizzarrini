import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
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
  // What the Editor just asked for, held until the Tavola is read back. Set in the same render
  // as the press, because a controlled box waiting on the mutation's own state is put back by
  // React first and ticks only a moment later.
  const [asked, setAsked] = useState<boolean | null>(null);
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
          checked={asked ?? on}
          disabled={typeNumbers.isPending}
          onChange={(event) => {
            const typed = event.target.checked;
            setAsked(typed);
            typeNumbers.mutate(typed, { onSettled: () => setAsked(null) });
          }}
          className="size-5 accent-accent"
        />
        Type the numbers upright
      </label>
      {typeNumbers.isError && <Refusal>{refusalText(typeNumbers.error)}</Refusal>}
    </div>
  );
}
