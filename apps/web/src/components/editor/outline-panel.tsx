import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Refusal, Select } from '@/components/ui/field';
import { CORNERS_TO_CLOSE } from '@/components/viewer/outline-layer';
import type { SubAssembly } from '@/lib/api';
import type { OutlineTool } from '@/lib/outlining';

/**
 * **Drawing round a Sub-assembly** (issue #113), the marking tool's outline mode.
 *
 * Two states, and only one thing to press in each. Choosing: which Sub-assembly, then draw (or
 * take off the outline it has). Drawing: the corners go on the drawing above, and the one action
 * here is closing it — the same as pressing the first corner or Enter, for whoever would rather
 * press a button than aim at a dot.
 */
export function OutlinePanel({
  tool,
  subAssemblies,
}: {
  tool: OutlineTool;
  subAssemblies: SubAssembly[];
}) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const chosen =
    subAssemblies.find((subAssembly) => subAssembly.id === chosenId) ?? subAssemblies[0] ?? null;
  const drawn = subAssemblies.find((subAssembly) => subAssembly.id === tool.subAssemblyId);

  if (tool.drawing && drawn) {
    const count = tool.corners.length;
    const closable = count >= CORNERS_TO_CLOSE;

    return (
      <section
        aria-labelledby="outlining"
        className="editor-panel registration-mark w-full animate-rise"
        data-testid="outline-panel"
      >
        <h2 id="outlining" className="label">
          Outlining {drawn.name}
        </h2>
        <p className="mt-4 max-w-measure text-pretty text-muted">
          Click the drawing to add a corner. Click the first corner, or press Enter, to close the
          outline. Escape abandons it.
        </p>
        <p className="mt-3 text-sm text-faint" aria-live="polite" data-testid="outline-corners">
          <span className="tabular text-text">{count}</span> {count === 1 ? 'corner' : 'corners'}
          {!closable && `. It closes at ${CORNERS_TO_CLOSE}.`}
        </p>

        <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-6">
          <Button variant="primary" disabled={!closable || tool.busy} onClick={tool.close}>
            Close outline
          </Button>
          <Button variant="ghost" className="ml-auto" onClick={tool.abandon}>
            Abandon
          </Button>
        </div>

        {tool.refusal && <Refusal>{tool.refusal}</Refusal>}
      </section>
    );
  }

  if (!chosen) {
    return null;
  }

  return (
    <section
      aria-labelledby="outline-a-sub-assembly"
      className="editor-panel w-full animate-rise"
      data-testid="outline-panel"
    >
      <h2 id="outline-a-sub-assembly" className="label">
        Outline a Sub-assembly
      </h2>

      <div className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-4">
        <Select
          label="Sub-assembly"
          className="min-w-64"
          value={chosen.id}
          onChange={(event) => setChosenId(event.target.value)}
          data-testid="outline-sub-assembly"
        >
          {subAssemblies.map((subAssembly) => (
            <option key={subAssembly.id} value={subAssembly.id}>
              {subAssembly.name}
              {subAssembly.outline ? ' (outlined)' : ''}
            </option>
          ))}
        </Select>

        <div className="flex flex-wrap gap-3">
          <Button disabled={tool.busy} onClick={() => tool.start(chosen.id)}>
            {chosen.outline ? 'Redraw outline' : 'Draw outline'}
          </Button>
          {chosen.outline && (
            <Button variant="ghost" disabled={tool.busy} onClick={() => tool.remove(chosen.id)}>
              Remove outline
            </Button>
          )}
        </div>
      </div>

      <p className="mt-4 max-w-measure text-sm text-pretty text-faint">
        Members see it when they point at the Sub-assembly’s name, or select it or one of its
        numbers.
      </p>

      {tool.refusal && <Refusal>{tool.refusal}</Refusal>}
    </section>
  );
}
