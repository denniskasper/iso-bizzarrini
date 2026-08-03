import type { Position } from '@/lib/api';

/**
 * The Position a member has clicked, and what the archive knows about it — which, at this
 * ticket, is nothing at all.
 *
 * **That emptiness is the honest answer and not a placeholder.** A Position exists because the
 * factory printed a number; marking a sheet up and finding out what sits at each number are
 * separate evenings' work, and a Tavola may stand half-built indefinitely. Saying "nothing is
 * recorded here yet" is the difference a member needs between *not known* and *not yet clicked*
 * (story 45). Ticket 06 replaces the sentence with the Part, beside the drawing rather than
 * instead of it.
 */
export function PositionPanel({ position }: { position: Position | null }) {
  if (!position) {
    return (
      <p className="max-w-measure text-pretty text-muted">
        Click a circle on the drawing, or a number below, to read a position.
      </p>
    );
  }

  return (
    <section aria-labelledby="position" aria-live="polite" className="animate-rise">
      <h2 id="position" className="text-2xs text-muted uppercase">
        Position
      </h2>
      <p className="tabular mt-2 text-4xl" data-testid="selected-position">
        {position.number}
      </p>
      <p className="mt-4 max-w-measure text-pretty text-muted">
        Nothing is recorded about this Position yet.
      </p>
      <p className="mt-2 max-w-measure text-sm text-pretty text-faint">{describeMarks(position)}</p>
    </section>
  );
}

/**
 * Where the number is on the sheet. Worth saying plainly: a number the factory printed in four
 * places is a part fitted in four places, which is a thing a member wants to know before they
 * order one — and a number printed nowhere is a part the drawing simply does not show.
 */
function describeMarks(position: Position): string {
  if (position.marks.length === 0) {
    return 'This number is listed but not drawn — it is not printed anywhere on this sheet.';
  }
  if (position.marks.length === 1) {
    return 'Printed once on this drawing.';
  }
  return `Printed in ${position.marks.length} places on this drawing.`;
}
