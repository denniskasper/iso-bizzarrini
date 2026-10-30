import { Link } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import type { Position, Sheet } from '@/lib/api';
import { positionsIn } from '@/lib/positions';
import { cn } from '@/lib/utils';

/**
 * **The sheet's Sub-assemblies, beside the drawing**, each name opening its own page (issue
 * #110). A sheet with none shows nothing, rather than a heading over an empty list.
 *
 * Read off the sheet the drawing arrived with, so it costs no request, and in the archive's own
 * order — by name, since nothing else orders a Sub-assembly.
 *
 * **And the way to find one on the drawing** (issue #113): pointing at a name, or focusing it,
 * shows its outline for as long as the pointer rests there. A finger cannot rest, so one that has
 * an outline can also be selected, and stays shown until something else is selected.
 */
export function SubAssemblyList({
  tavolaId,
  sheet,
  selectedId = null,
  onPoint,
  onSelect,
  outside = null,
}: {
  tavolaId: string;
  sheet: Sheet;
  /** The Sub-assembly selected to be shown on the drawing, if any. */
  selectedId?: string | null;
  /** A pointer or keyboard focus arrived at a name, and `null` when it left. */
  onPoint?: (subAssemblyId: string | null) => void;
  /** Selecting one to show, or `null` to stop. */
  onSelect?: (subAssemblyId: string | null) => void;
  /** An Editor's warning: by Sub-assembly, its Positions with a Mark outside its outline. */
  outside?: ReadonlyMap<string, Position[]> | null;
}) {
  if (sheet.subAssemblies.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="sheet-sub-assemblies" data-testid="sheet-sub-assemblies">
      <h2 id="sheet-sub-assemblies" className="label">
        Sub-assemblies on this sheet
      </h2>
      <ul className="mt-4 border-b border-line">
        {sheet.subAssemblies.map((subAssembly) => {
          const selected = subAssembly.id === selectedId;
          const strays = outside?.get(subAssembly.id) ?? [];
          return (
            <li
              key={subAssembly.id}
              className={cn(
                'flex flex-wrap items-stretch border-t border-line',
                selected && 'bg-surface-sunken',
              )}
              onPointerEnter={(event) => {
                if (event.pointerType !== 'touch') {
                  onPoint?.(subAssembly.id);
                }
              }}
              onPointerLeave={(event) => {
                if (event.pointerType !== 'touch') {
                  onPoint?.(null);
                }
              }}
            >
              <Link
                to="/tavole/$tavolaId/sub-assemblies/$subAssemblyId"
                params={{ tavolaId, subAssemblyId: subAssembly.id }}
                data-testid="sheet-sub-assembly"
                className="flex min-h-control flex-1 items-baseline justify-between gap-4 py-2 hover:bg-surface-sunken"
                onFocus={(event) => {
                  if (event.currentTarget.matches(':focus-visible')) {
                    onPoint?.(subAssembly.id);
                  }
                }}
                onBlur={() => onPoint?.(null)}
              >
                <span className="text-pretty text-accent-ink underline-offset-4 hover:underline">
                  {subAssembly.name}
                </span>
                <span className="tabular text-sm text-faint">
                  {positionsIn(sheet, subAssembly.id).length} numbers
                </span>
              </Link>
              {subAssembly.outline && onSelect && (
                <button
                  type="button"
                  data-testid="show-outline"
                  aria-pressed={selected}
                  aria-label={`Show ${subAssembly.name} on the drawing`}
                  onClick={() => onSelect(selected ? null : subAssembly.id)}
                  className={cn(
                    'min-h-control shrink-0 px-4 text-sm transition-colors duration-150 ease-[var(--ease-out-quick)]',
                    selected
                      ? 'text-accent-ink'
                      : 'text-muted hover:bg-surface-sunken hover:text-text',
                  )}
                >
                  {selected ? 'Shown' : 'Show'}
                </button>
              )}
              {strays.length > 0 && (
                <p
                  data-testid="outside-outline"
                  className="flex basis-full items-start gap-2 pb-3 text-sm text-pretty text-muted"
                >
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-alarm" />
                  <span>
                    Outside its outline:{' '}
                    {strays.map((position, index) => (
                      <span key={position.id}>
                        {index > 0 && ', '}
                        <span className="tabular text-text">{position.number}</span>
                      </span>
                    ))}
                  </span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
