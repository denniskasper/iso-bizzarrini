import type { CatalogRun } from '@ricambi/contracts';

/**
 * **A catalog being estimated** (issue #65), where its estimate will be. The server prices it a
 * page at a time after the upload has been answered, so what is shown is how far it has got: the
 * pages priced, said plainly, and the same bar a run's spending is drawn with.
 */
export function Estimating({ run }: { run: CatalogRun }) {
  const { pages, of } = run.estimating ?? { pages: 0, of: 1 };
  return (
    <div role="status" className="mt-10" data-testid="catalog-estimating">
      <p className="display text-5xl tracking-display text-text">Estimating…</p>
      <p className="mt-4 max-w-measure text-lg text-pretty text-text">
        <span className="tabular">{pages}</span> of <span className="tabular">{of}</span>{' '}
        {of === 1 ? 'page' : 'pages'} priced. The catalog is stored, and nothing is read.
      </p>
      <p className="mt-2 max-w-measure text-pretty text-muted">
        The server works it out on its own, so you can leave this page and find the run under Past
        runs.
      </p>
      <div
        role="progressbar"
        aria-label="Pages priced"
        aria-valuemin={0}
        aria-valuemax={of}
        aria-valuenow={pages}
        className="mt-6 h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className="h-full rounded-full bg-text transition-[width] duration-500 ease-[var(--ease-out-quick)] motion-reduce:transition-none"
          style={{ width: `${(pages / of) * 100}%` }}
        />
      </div>
    </div>
  );
}
