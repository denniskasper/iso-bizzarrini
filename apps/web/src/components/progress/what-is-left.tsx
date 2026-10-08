import type { ReactNode } from 'react';
import { PositionChip } from '@/components/positions/position-chip';
import { Counting, Fraction } from '@/components/progress/tally';
import { Button } from '@/components/ui/button';
import type { Position } from '@/lib/api';
import type { SheetProgress } from '@/lib/progress';

/**
 * **Where this sheet was left**, for the Editor coming back to it on another evening.
 *
 * Marking a Tavola up and finding out what sits at each of its numbers are separate evenings'
 * work, and a sheet may sit half-built indefinitely — which is a legitimate state and exactly why
 * this exists. Hundreds of drawings, two hundred numbers on some of them, all of it volunteers'
 * time: the thing that stops that work is opening a sheet and not knowing where it stopped.
 *
 * **It reports and it does not judge**, which is the one thing this panel had to get right. A
 * number the catalog prints that the drawing does not show is *finished* with no Mark on it
 * (GLOSSARY.md), so nothing here calls a sheet a fraction done or a number outstanding. It prints
 * three counts and the numbers behind two of them, and the Editor — who has the drawing in front
 * of them — knows which of those the factory never drew.
 *
 * **Nothing is capped.** A sheet of two hundred numbers with nothing listed prints two hundred
 * chips, because that is the list the work is done *from*, and an *"and 180 more"* would be the
 * archive hiding exactly the evenings it was asked to name. It is the same choice the sheet's own
 * index of numbers makes below the drawing, and it costs no request to make: this is one pass over
 * what the page is already holding.
 */
export function WhatIsLeft({
  progress,
  selectedPositionId,
  showingGaps,
  onShowGaps,
  onSelect,
}: {
  progress: SheetProgress;
  selectedPositionId: string | null;
  /** Whether the drawing is lighting the numbers with nothing recorded at them. */
  showingGaps: boolean;
  onShowGaps: (showing: boolean) => void;
  /** Reading one of these numbers, which takes the drawing to it. */
  onSelect: (position: Position) => void;
}) {
  const { tally } = progress;

  return (
    <section aria-labelledby="what-is-left" data-testid="sheet-progress">
      <h2 id="what-is-left" className="label">
        Where this sheet stands
      </h2>

      <Counting isPending={progress.isPending} error={progress.error} />

      {tally && tally.positions === 0 && (
        <p className="mt-4 max-w-measure text-pretty text-muted">
          No numbers have been recorded on this drawing yet.
        </p>
      )}

      {tally && tally.positions > 0 && (
        <>
          {/*
           * The three counts, set as the archive sets every factory number: mono, tabular, and
           * large enough to read at arm's length. Ruled off from one another rather than boxed —
           * a printed tally, not three cards.
           */}
          <dl
            className="mt-4 grid grid-cols-3 border-t border-line"
            data-testid="sheet-progress-counts"
          >
            <Count label="Numbers" testId="count-positions">
              {tally.positions}
            </Count>
            <Count label="Marked" testId="count-marked">
              <Fraction of={tally.marked} outOf={tally.positions} />
            </Count>
            <Count label="Listed" testId="count-listed">
              <Fraction of={tally.listed} outOf={tally.positions} />
            </Count>
          </dl>

          {tally.unmarked.length === 0 && tally.unlisted.length === 0 ? (
            <p className="mt-6 max-w-measure text-pretty text-muted">
              Every number on this sheet carries a circle and a Part.
            </p>
          ) : (
            <div className="mt-8 flex flex-col gap-8">
              {/*
               * **The gaps a member sees too**, which is why these come first: a number with
               * nothing recorded at it is the one thing on this screen somebody else is also
               * looking at and not finding.
               */}
              {tally.unlisted.length > 0 && (
                <Gap
                  testId="nothing-recorded"
                  heading="Nothing recorded yet"
                  explanation="A member opening this drawing finds these numbers empty as well."
                  positions={tally.unlisted}
                  selectedPositionId={selectedPositionId}
                  onSelect={onSelect}
                  /*
                   * **Lighting them on the drawing is something an Editor asks for.** It is the
                   * same mechanism a Sub-assembly uses — what was not asked about recedes, so
                   * "the bright ones are the ones you asked for" needs no legend — and it is off
                   * by default for the same reason: most of the archive is incomplete at the
                   * start, and a drawing that dimmed itself the moment it opened would be the
                   * interface deciding what a member came to look at.
                   */
                  action={
                    <Button
                      variant={showingGaps ? 'outline' : 'ghost'}
                      data-testid="show-gaps"
                      aria-pressed={showingGaps}
                      onClick={() => onShowGaps(!showingGaps)}
                    >
                      {showingGaps ? 'Showing on the drawing' : 'Show on the drawing'}
                    </Button>
                  }
                />
              )}

              {/*
               * And the numbers the drawing has no circle for — **which is why they are here and
               * not on it.** There is nothing to light up: a Position with no Mark is a Position
               * with nothing on the sheet to distinguish. The panel is the only place it can be
               * shown at all, and saying so plainly beats a drawing that quietly omits it.
               */}
              {tally.unmarked.length > 0 && (
                <Gap
                  testId="no-circle"
                  heading="No circle on the drawing"
                  explanation="Nothing on the sheet points at these. Some the factory never drew — those are finished as they are."
                  positions={tally.unmarked}
                  selectedPositionId={selectedPositionId}
                  onSelect={onSelect}
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** One of the three counts: the figure an Editor reads across the room, and what it counts. */
function Count({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-line py-3">
      <dt className="label">{label}</dt>
      <dd className="tabular mt-1 text-2xl" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

/** One kind of gap, and the numbers in it — set as the sheet's numbers are set everywhere. */
function Gap({
  testId,
  heading,
  explanation,
  positions,
  selectedPositionId,
  onSelect,
  action,
}: {
  testId: string;
  heading: string;
  explanation: string;
  positions: Position[];
  selectedPositionId: string | null;
  onSelect: (position: Position) => void;
  action?: ReactNode;
}) {
  return (
    <section data-testid={testId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h3 className="label">
          {heading} <span className="tabular text-faint">({positions.length})</span>
        </h3>
        {action}
      </div>
      <p className="mt-2 max-w-measure text-xs text-pretty text-faint">{explanation}</p>

      <ul className="mt-4 flex flex-wrap gap-2">
        {positions.map((position) => (
          <li key={position.id}>
            <PositionChip
              position={position}
              selected={position.id === selectedPositionId}
              onSelect={onSelect}
              testId={`${testId}-position`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
