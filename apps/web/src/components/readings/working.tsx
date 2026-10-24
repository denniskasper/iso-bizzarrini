import type { ReactNode } from 'react';

/**
 * **Work under way that has no figure yet**: a catalog on its way to the server, or a run between
 * one Tavola and the next. Reading a page takes the model a minute or more, and a screen that does
 * not change for that long looks stopped.
 *
 * The same track the estimate and the spending are drawn on, with a short length of it crossing
 * again and again, and under it what is being done, said plainly. Where motion is reduced the
 * track is shown full and faint instead, and the words do the work.
 */
export function Working({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-6" data-testid="working">
      <div
        role="progressbar"
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div className="h-full w-1/4 animate-sweep rounded-full bg-text motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-30" />
      </div>
      <p className="mt-3 max-w-measure text-pretty text-text" aria-live="polite">
        {children}
      </p>
    </div>
  );
}
