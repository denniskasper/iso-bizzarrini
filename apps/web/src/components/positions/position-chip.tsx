import type { Position } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * One number off the sheet, as a thing to point at.
 *
 * **The sheet's numbers are set one way, here.** They appear in three places — every number on
 * the drawing, the numbers in a Sub-assembly, and the numbers a Position is linked to — and a
 * member has to read them as the same object in all three: monospace and tabular like every
 * factory number in this archive, ruled, and wearing the archive's broken rule when the drawing
 * does not print them.
 *
 * The Club's teal marks the one being read, which the visual language sanctions for a Mark **and
 * the Position it belongs to wherever else that Position appears** — the circle on the sheet and
 * this chip are one thing being pointed at.
 */
export function PositionChip({
  position,
  selected,
  onSelect,
  testId = 'position-chip',
}: {
  position: Position;
  selected: boolean;
  onSelect: (position: Position) => void;
  /** Which list this is one of, for the seam that has to tell the three apart. */
  testId?: string;
}) {
  const undrawn = position.marks.length === 0;

  return (
    <button
      type="button"
      data-testid={testId}
      data-position={position.number}
      aria-pressed={selected}
      onClick={() => onSelect(position)}
      className={cn(
        'tabular inline-flex h-control min-w-control items-center justify-center px-3',
        'rounded-md border text-sm transition-colors duration-150 ease-[var(--ease-out-quick)]',
        undrawn ? 'border-dashed border-line-strong text-muted' : 'border-line-strong text-text',
        selected
          ? 'border-mark bg-mark text-accent-contrast'
          : 'bg-surface-raised hover:bg-surface-sunken',
      )}
    >
      {position.number}
      {undrawn && <span className="sr-only">, listed but not drawn</span>}
    </button>
  );
}
