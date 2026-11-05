import { useEffect, useEffectEvent, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import type { Position } from '@/lib/api';
import type { MarkingTool } from '@/lib/marking';
import { useTavolaListings } from '@/lib/parts';

/**
 * The picked numbers, said the way an Editor reads the sheet: in its order, a run of neighbours
 * as one range. "23–36", or "4, 9, 23–36" — never fourteen numbers in a row.
 */
export function describePicked(positions: Position[], picked: ReadonlySet<string>): string {
  const runs: Position[][] = [];
  let run: Position[] = [];
  for (const position of positions) {
    if (picked.has(position.id)) {
      run.push(position);
    } else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) {
    runs.push(run);
  }
  return runs
    .map((one) =>
      one.length === 1
        ? (one[0]?.number ?? '')
        : `${one[0]?.number ?? ''}–${one.at(-1)?.number ?? ''}`,
    )
    .join(', ');
}

/** "1 Position", "14 Positions": a count and the word for it, agreeing. */
function counted(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * The marking tool (stories 96–99), and the shape of it is an argument about time.
 *
 * **Placing a Mark is one click**, so there is no dialogue, no confirmation and nothing to
 * choose: the number the next click will place is already in the field, and by the time the
 * Editor's hand is back on the drawing it has advanced. Marking a two-hundred-position Tavola
 * is an afternoon at that rate and a week at any other.
 *
 * The field is the largest thing here on purpose. Everything else on this bar is something an
 * Editor does occasionally; the number is the one thing they read between every pair of clicks,
 * and it is set the way this archive sets every factory number — monospace and tabular, because
 * it is an identifier being compared against a printed page.
 */
export function MarkingBar({
  tavolaId,
  tool,
  positions,
  selected,
  onDeselect,
}: {
  tavolaId: string;
  tool: MarkingTool;
  positions: Position[];
  /** What the Editor last pointed at, so a circle in the wrong place can be taken off. */
  selected: { position: Position; markId: string | null } | null;
  onDeselect: () => void;
}) {
  const fieldId = useId();
  const holdId = useId();
  const alreadyOnTheSheet = positions.find((position) => position.number === tool.number.trim());
  const selectedMarkId = selected?.markId ?? null;
  const selectedMark = selected?.position.marks.find((mark) => mark.id === selectedMarkId) ?? null;
  const unreadableId = useId();
  /**
   * What the Editor just said about the print, shown until the archive answers — the sheet comes
   * back a moment later, and a box that did not tick when pressed reads as a press that missed.
   */
  const [asked, setAsked] = useState<{ markId: string; illegible: boolean } | null>(null);
  /** The Position whose removal has been asked for once, and is waiting for the second press. */
  const [removing, setRemoving] = useState<string | null>(null);
  const confirming = selected !== null && removing === selected.position.id;

  /**
   * **Several numbers at once** (issue #240). What is picked, as the sheet now has it — a number
   * somebody else removed meanwhile is no longer one to ask about — and how many of those carry
   * something the club recorded, so a cleanup does not take real work with it unannounced.
   */
  const [removingPicked, setRemovingPicked] = useState(false);
  const listings = useTavolaListings(tavolaId);
  const picked = positions.filter((position) => tool.picked.has(position.id));
  const listed = new Set(listings.data?.listings.map((listing) => listing.positionId));
  const withSomethingRecorded = picked.filter(
    (position) =>
      listed.has(position.id) || position.related.length > 0 || position.subAssemblyId !== null,
  ).length;
  const confirmingPicked = tool.selecting && removingPicked && picked.length > 0;

  /**
   * **Ctrl+Z, or ⌘Z**, while the tool is open (issue #236) — except in a text field, where it
   * belongs to the typing, as it does everywhere else.
   */
  const undoFromKeyboard = useEffectEvent((event: KeyboardEvent) => {
    const typing =
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLInputElement && event.target.type !== 'checkbox'));
    if (
      event.key.toLowerCase() === 'z' &&
      !event.repeat &&
      !event.defaultPrevented &&
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      !event.altKey &&
      !typing
    ) {
      event.preventDefault();
      tool.undo();
    }
  });
  useEffect(() => {
    const pressed = (event: KeyboardEvent) => undoFromKeyboard(event);
    window.addEventListener('keydown', pressed);
    return () => window.removeEventListener('keydown', pressed);
  }, []);

  return (
    <section
      aria-labelledby="marking"
      className="editor-panel registration-mark w-full animate-rise"
    >
      <h2 id="marking" className="label">
        Marking up this drawing
      </h2>

      <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-6">
        <div className="flex flex-col gap-2">
          <label htmlFor={fieldId} className="label">
            Next number
          </label>
          <input
            id={fieldId}
            data-testid="next-number"
            value={tool.number}
            onChange={(event) => tool.setNumber(event.target.value)}
            // The Editor is almost always replacing what the tool guessed rather than editing
            // it — a suffix typed onto `211`, or a jump to another part of the sheet.
            onFocus={(event) => event.target.select()}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${fieldId}-hint`}
            className={[
              'tabular h-control-lg w-40 rounded-md border border-line-strong bg-surface-raised px-4',
              'text-3xl text-text transition-colors duration-150 ease-[var(--ease-out-quick)]',
              'focus:border-accent-ink',
            ].join(' ')}
          />
        </div>

        {/* Wide enough to be worth sitting beside the field, and on a phone it takes its own
            line rather than squeezing the instruction into a column of single words. */}
        <div className="max-w-measure min-w-64 flex-1">
          <p id={`${fieldId}-hint`} className="text-pretty text-muted">
            {tool.selecting
              ? 'Press numbers below, or circles on the drawing, to select them. Shift+click a number below to select every number up to it.'
              : 'Click the drawing to place a Mark. Drag a circle to move it. The number goes up by one each time — type over it for a suffix, or to jump.'}
          </p>

          {/*
           * The factory prints one number wherever the part is used, and marking all four of
           * them has to cost four clicks and nothing else. This is the whole mechanism: the
           * number stops advancing, and every click puts another circle on the same Position.
           */}
          <label htmlFor={holdId} className="mt-4 flex items-center gap-3 text-sm text-muted">
            <input
              id={holdId}
              type="checkbox"
              data-testid="hold-number"
              checked={tool.held}
              onChange={(event) => tool.setHeld(event.target.checked)}
              className="size-5 accent-accent"
            />
            Keep this number — for a number printed in more than one place
          </label>

          {alreadyOnTheSheet && (
            <p className="mt-3 text-sm text-pretty text-faint">
              <span className="tabular">{alreadyOnTheSheet.number}</span> is already on this sheet
              {alreadyOnTheSheet.marks.length > 0
                ? '. Clicking the drawing adds another circle to it.'
                : ', with no circle on it yet.'}
            </p>
          )}
        </div>
      </div>

      {/*
       * A print too faint or smudged to read (issue #234): the club types the Position's number
       * over this one circle, and leaves the Scan as it is. The Position's other circles keep
       * their own say.
       */}
      {selectedMark && (
        <label
          htmlFor={unreadableId}
          className="mt-6 flex min-h-control items-center gap-3 text-sm text-muted"
        >
          <input
            id={unreadableId}
            type="checkbox"
            data-testid="print-unreadable"
            checked={asked?.markId === selectedMark.id ? asked.illegible : selectedMark.illegible}
            disabled={tool.busy}
            onChange={(event) => {
              const illegible = event.target.checked;
              setAsked({ markId: selectedMark.id, illegible });
              tool.markLegibility(selectedMark.id, illegible, () => setAsked(null));
            }}
            className="size-5 accent-accent"
          />
          Print unreadable
        </label>
      )}

      <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-6">
        {/* First, so it is in the same place whatever else the row is showing. */}
        <Button
          variant="outline"
          disabled={tool.busy || !tool.canUndo}
          onClick={tool.undo}
          title="Take back the last thing the tool did (Ctrl+Z, or ⌘Z on a Mac)"
        >
          Undo
        </Button>

        {/* A switch, so it says which way a press on a number goes; not in the Mark's blue,
            which here means the numbers picked. */}
        <Button
          variant="outline"
          aria-pressed={tool.selecting}
          onClick={() => {
            setRemovingPicked(false);
            tool.setSelecting(!tool.selecting);
          }}
        >
          {tool.selecting ? 'Stop selecting' : 'Select numbers'}
        </Button>

        {!tool.selecting && (
          <Button variant="outline" disabled={tool.busy} onClick={tool.list}>
            List without a Mark
          </Button>
        )}

        {tool.selecting && picked.length > 0 && !confirmingPicked && (
          <Button variant="outline" disabled={tool.busy} onClick={() => setRemovingPicked(true)}>
            Remove {counted(picked.length, 'Position')}
          </Button>
        )}

        {!tool.selecting && selectedMarkId && (
          <Button
            variant="outline"
            disabled={tool.busy}
            onClick={() => tool.removeMark(selectedMarkId)}
          >
            Remove this Mark
          </Button>
        )}

        {/* Asked twice, because Undo cannot bring it back: the number goes with its circles,
            its links and its place in a Sub-assembly. */}
        {!tool.selecting && selected && !confirming && (
          <Button
            variant="outline"
            disabled={tool.busy}
            onClick={() => setRemoving(selected.position.id)}
          >
            Remove Position {selected.position.number}
          </Button>
        )}

        <Button variant="ghost" className="ml-auto" onClick={tool.stop}>
          Done
        </Button>
      </div>

      {tool.selecting && (
        <p className="mt-6 text-pretty" data-testid="picked-numbers" aria-live="polite">
          {picked.length === 0 ? (
            <span className="text-muted">No numbers selected.</span>
          ) : (
            <>
              {counted(picked.length, 'number')}:{' '}
              <span className="tabular">{describePicked(positions, tool.picked)}</span>
            </>
          )}
        </p>
      )}

      {/* Asked twice, as one number is — and saying how many carry something recorded, which
          goes with them: their links and Sub-assembly places, and their Listings' numbers. */}
      {confirmingPicked && (
        <div
          className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3"
          role="group"
          aria-label={`Remove ${counted(picked.length, 'Position')}`}
        >
          <p className="max-w-measure text-pretty">
            Remove {counted(picked.length, 'Position')} and their circles?{' '}
            {withSomethingRecorded > 0 &&
              (withSomethingRecorded === 1
                ? '1 of them has something recorded at it — a Listing, a link or a Sub-assembly. '
                : `${withSomethingRecorded} of them have something recorded at them — Listings, links or a Sub-assembly. `)}
            Undo cannot bring them back.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="danger"
              disabled={tool.busy}
              onClick={() => {
                setRemovingPicked(false);
                tool.removePicked();
              }}
            >
              {tool.busy ? 'Removing…' : 'Yes, remove them'}
            </Button>
            <Button variant="ghost" onClick={() => setRemovingPicked(false)}>
              Keep them
            </Button>
          </div>
        </div>
      )}

      {!tool.selecting && selected && confirming && (
        <div
          className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3"
          role="group"
          aria-label={`Remove Position ${selected.position.number}`}
        >
          <p className="max-w-measure text-pretty">
            Remove Position <span className="tabular">{selected.position.number}</span> and its
            circles? Undo cannot bring it back.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="danger"
              disabled={tool.busy}
              onClick={() => {
                setRemoving(null);
                onDeselect();
                tool.removePosition(selected.position.id);
              }}
            >
              {tool.busy ? 'Removing…' : 'Yes, remove it'}
            </Button>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
          </div>
        </div>
      )}

      {tool.refusal && <Refusal>{tool.refusal}</Refusal>}
    </section>
  );
}
