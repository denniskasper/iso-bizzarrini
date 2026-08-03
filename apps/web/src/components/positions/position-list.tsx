import type { ReactNode } from 'react';
import type { Position } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Every number on the sheet, in the order the factory printed them — and the one place a
 * Position carrying **no** Mark can be seen at all.
 *
 * Dense and calm: a Tavola can carry over two hundred of these, so they are set the way this
 * archive sets every factory number — monospace, tabular, ruled — and nothing is decorated. A
 * number the drawing does not show wears a broken rule, which is a printer's own way of saying
 * "listed here, not on the plate".
 *
 * **What is deliberately not here is a count of them.** How much of a Tavola is still to do is
 * an Editor's question and ticket 11 answers it, for a Model as well as for a sheet; this is
 * what a member reads, and to a member the sheet is simply what it is.
 */
export function PositionList({
  positions,
  selectedPositionId,
  onSelect,
  action,
}: {
  positions: Position[];
  selectedPositionId: string | null;
  onSelect: (position: Position) => void;
  /** Whatever this screen offers about the sheet as a whole — the Editor's way in. */
  action?: ReactNode;
}) {
  const anyUndrawn = positions.some((position) => position.marks.length === 0);

  return (
    <section aria-labelledby="positions">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div>
          <h2 id="positions" className="text-2xs text-muted uppercase">
            On this sheet
          </h2>
          <p className="mt-2 max-w-measure text-sm text-pretty text-muted">
            {positions.length === 0
              ? 'No positions recorded yet.'
              : anyUndrawn
                ? 'A broken rule means the number is listed but the drawing does not show it.'
                : 'Every number the factory printed on this drawing.'}
          </p>
        </div>
        {action}
      </div>

      {positions.length > 0 && (
        <ul className="mt-6 flex flex-wrap gap-2 border-t border-line pt-6">
          {positions.map((position) => (
            <li key={position.id}>
              <button
                type="button"
                data-testid="position-chip"
                data-position={position.number}
                aria-pressed={position.id === selectedPositionId}
                onClick={() => onSelect(position)}
                className={cn(
                  'tabular inline-flex h-control min-w-control items-center justify-center px-3',
                  'rounded-md border text-sm transition-colors duration-150 ease-[var(--ease-out-quick)]',
                  position.marks.length === 0
                    ? 'border-dashed border-line-strong text-muted'
                    : 'border-line-strong text-text',
                  position.id === selectedPositionId
                    ? 'border-mark bg-mark text-accent-contrast'
                    : 'bg-surface-raised hover:bg-surface-sunken',
                )}
              >
                {position.number}
                {position.marks.length === 0 && (
                  <span className="sr-only">, listed but not drawn</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
