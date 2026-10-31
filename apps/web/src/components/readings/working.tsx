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
      <Sweep label={label} className="h-2 w-full" />
      <p className="mt-3 max-w-measure text-pretty text-text" aria-live="polite">
        {children}
      </p>
    </div>
  );
}

/**
 * **The track, waiting for its number**: a short length of it crossing again and again, or, where
 * motion is reduced, the whole track faint. Sized by the caller; unlabelled, it is only drawn, and
 * the words beside it say what is being done.
 */
export function Sweep({ label, className }: { label?: string; className: string }) {
  return (
    <div
      {...(label ? { role: 'progressbar', 'aria-label': label } : { 'aria-hidden': true })}
      className={`${className} overflow-hidden rounded-full bg-surface-sunken`}
    >
      <div className="h-full w-1/4 animate-sweep rounded-full bg-text motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-30" />
    </div>
  );
}
