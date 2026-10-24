import type { TavolaRemoval } from '@ricambi/contracts';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import { refusalText } from '@/lib/api';
import { useRemoveTavola, useTavolaRemoval } from '@/lib/readings';

/**
 * **Removing an Unchecked Tavola** (issue #83), for an Administrator, where a Catalog run read
 * something nobody wants: a practice run, the wrong Model, a page that is not a Tavola. Quieter
 * than Read again beside it, and asked twice, in the way removing a Part is: there is no undo,
 * and the way back is reading its pages again in a new Catalog run.
 *
 * The second step says first what goes with it, as the server reckons it (issue #84): its
 * Positions, Marks, Listings, Table sheets and Scan, and the Parts listed nowhere else, by
 * Catalog Number and name. Refused for a Tavola with Contributions on its Positions and while a
 * Catalog run is reading, and the refusal says why where the button was.
 */
export function RemoveTavola({ tavolaId }: { tavolaId: string }) {
  const [asked, setAsked] = useState(false);
  const removal = useTavolaRemoval(tavolaId, asked);
  const removeTavola = useRemoveTavola();
  const navigate = useNavigate();

  function keep() {
    setAsked(false);
    removeTavola.reset();
  }

  return (
    <div className="flex flex-col gap-4" data-testid="remove-tavola">
      {!asked ? (
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <p className="max-w-measure text-pretty text-muted">
            Read by mistake? Remove it, with its Positions, Listings and files, and the Parts listed
            nowhere else.
          </p>
          <Button
            type="button"
            variant="danger"
            onClick={() => setAsked(true)}
            title="See what removing it would take with it. Nothing is removed until you confirm"
          >
            Remove this Tavola
          </Button>
        </div>
      ) : removal.isPending ? (
        <p className="text-muted" role="status">
          Working out what goes with it…
        </p>
      ) : removal.isError ? (
        <Refusal>{refusalText(removal.error)}</Refusal>
      ) : (
        <>
          <WhatGoes removal={removal.data.removal} />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="danger"
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
            <Button type="button" variant="ghost" onClick={keep}>
              Keep it
            </Button>
          </div>
          {removeTavola.error && <Refusal>{refusalText(removeTavola.error)}</Refusal>}
        </>
      )}
    </div>
  );
}

/** What the removal takes, in a sentence, and then the Parts that leave the archive with it. */
function WhatGoes({ removal }: { removal: TavolaRemoval }) {
  const things = [
    counted(removal.positions, 'Position'),
    counted(removal.marks, 'Mark'),
    counted(removal.listings, 'Listing'),
    counted(removal.tableSheets, 'Table sheet'),
    ...(removal.scan ? ['its Scan'] : []),
  ];

  return (
    <div className="flex flex-col gap-3" data-testid="what-removal-takes">
      <p className="max-w-measure text-lg text-pretty">
        Removing this Tavola takes {inWords(things)} with it.
      </p>
      {removal.parts.length === 0 ? (
        <p className="max-w-measure text-pretty text-muted">
          No Part goes: every Part it lists is listed on another Tavola too, and stays.
        </p>
      ) : (
        <>
          <p className="max-w-measure text-pretty text-muted">
            {removal.parts.length === 1
              ? 'This Part is listed nowhere else, and goes with it:'
              : `These ${removal.parts.length} Parts are listed nowhere else, and go with it:`}
          </p>
          <ul className="max-w-measure divide-y divide-line border-y border-line">
            {removal.parts.map((part) => (
              <li key={part.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
                <span className="tabular">
                  {part.catalogNumber ?? (
                    <span className="text-sm text-faint">No factory number</span>
                  )}
                </span>
                <span className="text-pretty">{part.nameIt ?? part.nameEn}</span>
              </li>
            ))}
          </ul>
          <p className="max-w-measure text-sm text-pretty text-faint">
            Parts also listed on other Tavole stay, with their Listings there.
          </p>
        </>
      )}
    </div>
  );
}

function counted(n: number, thing: string): string {
  return `${n} ${thing}${n === 1 ? '' : 's'}`;
}

/** "a, b and c". */
function inWords(things: string[]): string {
  return things.length <= 1
    ? things.join('')
    : `${things.slice(0, -1).join(', ')} and ${things[things.length - 1]}`;
}
