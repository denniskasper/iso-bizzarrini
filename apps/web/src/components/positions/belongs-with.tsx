import { PositionChip } from '@/components/positions/position-chip';
import { Button } from '@/components/ui/button';
import type { Position, Sheet } from '@/lib/api';
import { positionsIn, relatedTo, subAssemblyOf } from '@/lib/positions';

/**
 * **What belongs with the number a member is reading** — the named Sub-assembly it sits in, and
 * the one part it works against.
 *
 * These are two answers to two questions and they are printed as two blocks, deliberately. A
 * Sub-assembly is broad — *Window Slider*, eleven numbers — and answers "what am I taking apart";
 * a Related Position is narrow and hand-picked, and answers "what else do I need to order". A
 * member who read the second as the first would order eleven things they did not want, and one
 * who read the first as the second would order one thing out of eleven.
 *
 * **A number in neither shows nothing at all.** Not a heading saying "none", which on a sheet
 * where most numbers are in no Sub-assembly would be a denial printed two hundred times — the
 * same argument the Part's own three lists make.
 */
export function BelongsWith({
  sheet,
  position,
  showingSubAssembly,
  onShowSubAssembly,
  onSelect,
}: {
  sheet: Sheet;
  position: Position;
  /** Whether this number's Sub-assembly is the one lit on the drawing at the moment. */
  showingSubAssembly: boolean;
  onShowSubAssembly: (subAssemblyId: string | null) => void;
  /** Selecting one of these numbers reads it, and takes the drawing to its circle. */
  onSelect: (position: Position) => void;
}) {
  const subAssembly = subAssemblyOf(sheet, position);
  const alsoInIt = subAssembly ? positionsIn(sheet, subAssembly.id) : [];
  const related = relatedTo(sheet, position);

  if (!subAssembly && related.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 flex flex-col gap-8 border-t border-line pt-6">
      {subAssembly && (
        <section data-testid="sub-assembly">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h3 className="text-2xs text-muted uppercase">Sub-assembly</h3>
            {/*
             * **Lighting the rest of it on the sheet is something a member asks for**, and can
             * stop asking for. It is not on by default: a drawing that dimmed two-thirds of itself
             * the moment somebody clicked a circle would be the interface deciding what they came
             * to look at.
             */}
            {/*
             * Ruled while it is on and plain while it is off, so "the drawing is answering this"
             * is visible without reading the label. It does **not** wear the accent: the teal on
             * this screen means the Position being pointed at, and a switch wearing it would be
             * the third thing on the panel claiming to be what the member is looking at.
             */}
            <Button
              variant={showingSubAssembly ? 'outline' : 'ghost'}
              data-testid="show-sub-assembly"
              aria-pressed={showingSubAssembly}
              onClick={() => onShowSubAssembly(showingSubAssembly ? null : subAssembly.id)}
            >
              {showingSubAssembly ? 'Showing on the drawing' : 'Show on the drawing'}
            </Button>
          </div>

          <p className="mt-2 text-lg text-pretty">{subAssembly.name}</p>
          <p className="mt-1 max-w-measure text-xs text-pretty text-faint">
            <span className="tabular">{alsoInIt.length}</span> numbers the club keeps together. A
            name for what comes apart at once — not a kit, and nothing here is ordered as one.
          </p>

          <ul className="mt-4 flex flex-wrap gap-2">
            {alsoInIt.map((number) => (
              <li key={number.id}>
                <PositionChip
                  position={number}
                  selected={number.id === position.id}
                  onSelect={onSelect}
                  testId="sub-assembly-position"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section data-testid="related-positions">
          <h3 className="text-2xs text-muted uppercase">Works with</h3>
          <p className="mt-2 max-w-measure text-xs text-pretty text-faint">
            Picked by hand, because the parts at these numbers work against this one.
          </p>

          <ul className="mt-4 flex flex-wrap gap-2">
            {related.map((link) => (
              <li key={link.linkId}>
                <PositionChip
                  position={link.position}
                  selected={false}
                  onSelect={onSelect}
                  testId="related-position"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
