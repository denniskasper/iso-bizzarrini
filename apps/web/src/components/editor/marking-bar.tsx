import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import type { Position } from '@/lib/api';
import type { MarkingTool } from '@/lib/marking';

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
  tool,
  positions,
  selected,
  onDeselect,
}: {
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
            Click the drawing to place a Mark. Drag a circle to move it. The number goes up by one
            each time — type over it for a suffix, or to jump.
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

      <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-6">
        <Button variant="outline" disabled={tool.busy} onClick={tool.list}>
          List without a Mark
        </Button>

        {selectedMarkId && (
          <Button
            variant="outline"
            disabled={tool.busy}
            onClick={() => tool.removeMark(selectedMarkId)}
          >
            Remove this Mark
          </Button>
        )}

        {selected && (
          <Button
            variant="outline"
            disabled={tool.busy}
            onClick={() => {
              onDeselect();
              tool.removePosition(selected.position.id);
            }}
          >
            Remove Position {selected.position.number}
          </Button>
        )}

        <Button variant="ghost" className="ml-auto" onClick={tool.stop}>
          Done
        </Button>
      </div>

      {tool.refusal && <Refusal>{tool.refusal}</Refusal>}
    </section>
  );
}
