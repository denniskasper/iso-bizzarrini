import type { CatalogRun } from '@ricambi/contracts';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Refusal } from '@/components/ui/field';
import { refusalText } from '@/lib/api';
import { useStartCatalogRun } from '@/lib/readings';

/**
 * **Starting the run** (issue #58), with a limit the Administrator types: there is no default,
 * so nothing is spent because a box was left as it came. It reads on the server from then on,
 * and the run's own page is where it is watched. Under a catalog's estimate on the Readings
 * screen, and on the run page of one Tavola read again (issue #61).
 */
export function StartRun({ run }: { run: CatalogRun }) {
  const start = useStartCatalogRun();
  const navigate = useNavigate();
  const [limit, setLimit] = useState('');
  const dollars = Number(limit);

  return (
    <form
      className="mt-10 flex flex-col gap-6 border-t border-line pt-10"
      onSubmit={(event) => {
        event.preventDefault();
        start.mutate(
          { runId: run.id, limit: dollars },
          {
            onSuccess: () =>
              void navigate({ to: '/readings/runs/$runId', params: { runId: run.id } }),
          },
        );
      }}
    >
      <Field
        label="Spending limit, in dollars"
        hint="The run never passes it. It stops before any sheet that could, and keeps every Tavola it has read."
        type="number"
        inputMode="decimal"
        min={0.01}
        step={0.01}
        mono
        className="sm:max-w-xs"
        value={limit}
        onChange={(event) => {
          start.reset();
          setLimit(event.target.value);
        }}
      />

      {start.error && <Refusal>{refusalText(start.error)}</Refusal>}

      <div>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={limit === '' || !(dollars > 0) || start.isPending}
        >
          {start.isPending ? 'Starting…' : 'Start reading'}
        </Button>
      </div>
    </form>
  );
}
