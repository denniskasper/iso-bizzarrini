import type { CatalogRun, CatalogRunState, CatalogRunTavola } from '@ricambi/contracts';
import { Link, useParams } from '@tanstack/react-router';
import { AdministratorsOnly } from '@/components/roster/administrators-only';
import { refusalText } from '@/lib/api';
import { useCatalogRun } from '@/lib/readings';

/**
 * **One Catalog run** (issue #58). The run reads on the server, so this page is somewhere to look
 * rather than something to keep open: what it has spent against its limit, said large, and each
 * Tavola it has found, with what it cost and a way to its Unchecked page as soon as it is there.
 */
export function CatalogRunPage() {
  return (
    <AdministratorsOnly what="Reading the catalog">
      <Run />
    </AdministratorsOnly>
  );
}

function Run() {
  const { runId } = useParams({ from: '/readings/runs/$runId' });
  const run = useCatalogRun(runId);

  return (
    <div className="mx-auto max-w-measure animate-rise">
      <Link
        to="/readings"
        className="-my-2 flex min-h-control items-center text-sm text-muted hover:text-text"
      >
        Readings
      </Link>

      {run.isPending ? null : run.isError ? (
        <p className="mt-6 text-lg text-pretty text-muted">{refusalText(run.error)}</p>
      ) : (
        <RunRecord run={run.data.run} />
      )}
    </div>
  );
}

function RunRecord({ run }: { run: CatalogRun }) {
  const pages = run.pages.last - run.pages.first + 1;
  return (
    <>
      <h1 className="display mt-4 text-4xl tracking-display text-balance sm:text-5xl">
        The {run.model.brand} {run.model.name} catalog
      </h1>
      <p className="mt-4 text-lg text-pretty text-muted">
        {pages} {pages === 1 ? 'page' : 'pages'}, {run.pages.first} to {run.pages.last}.{' '}
        {run.charged
          ? 'Billed to the API key.'
          : 'Not charged: its figures are what it would cost at list prices.'}
      </p>

      <Spending run={run} />

      <p
        className="mt-6 text-lg font-medium text-pretty text-text"
        role="status"
        data-testid="catalog-run-state"
      >
        {stateNamed(run.state)}
      </p>
      {run.failure && <p className="mt-2 text-pretty text-alarm">{run.failure}</p>}

      <Tavole run={run} />
    </>
  );
}

/** The running total against the limit: the one figure the run is held to. */
function Spending({ run }: { run: CatalogRun }) {
  const limit = run.limit ?? run.estimate;
  const share = limit > 0 ? Math.min(1, run.spent / limit) : 0;
  return (
    <section className="mt-12" aria-label="Spent so far">
      <p className="display tabular text-6xl tracking-display text-text" data-testid="run-spent">
        {dollars(run.spent)}
      </p>
      <p className="mt-2 text-pretty text-muted">
        {run.charged ? 'spent' : 'would have been spent'} of a limit of{' '}
        <span className="tabular text-text">
          {run.limit === null ? 'none yet' : dollars(limit)}
        </span>
        . Estimated at <span className="tabular">{dollars(run.estimate)}</span>.
      </p>
      <div
        role="meter"
        aria-label="Spent against the limit"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={run.spent}
        className="mt-6 h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className="h-full rounded-full bg-text transition-[width] duration-500 ease-[var(--ease-out-quick)] motion-reduce:transition-none"
          style={{ width: `${share * 100}%` }}
        />
      </div>
    </section>
  );
}

function Tavole({ run }: { run: CatalogRun }) {
  if (run.tavole.length === 0) {
    return (
      <p className="mt-12 text-pretty text-muted">
        {run.state === 'running'
          ? 'Each Tavola is listed here once its pages have been found, and opens as soon as it is read.'
          : 'This run found no Tavola to read.'}
      </p>
    );
  }
  return (
    <section className="mt-12" aria-labelledby="run-tavole">
      <h2 id="run-tavole" className="label">
        Tavole
      </h2>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {run.tavole.map((tavola) => (
          <TavolaLine key={tavola.number} tavola={tavola} running={run.state === 'running'} />
        ))}
      </ul>
    </section>
  );
}

function TavolaLine({ tavola, running }: { tavola: CatalogRunTavola; running: boolean }) {
  return (
    <li
      className="flex min-h-control flex-wrap items-baseline gap-x-6 gap-y-1 py-3"
      data-testid="run-tavola"
    >
      <span className="text-lg font-medium text-text">Tavola {tavola.number}</span>
      <span className="tabular text-muted">{dollars(tavola.cost)}</span>
      <span className="ml-auto text-pretty">
        {tavola.tavolaId ? (
          <Link
            to="/tavole/$tavolaId"
            params={{ tavolaId: tavola.tavolaId }}
            className="-my-2 inline-flex min-h-control items-center text-accent-ink underline underline-offset-4"
          >
            Open, Unchecked
          </Link>
        ) : tavola.refused ? (
          <span className="text-muted">Not loaded. {tavola.refused}</span>
        ) : (
          <span className="text-faint">
            {tavola.finished ? 'Read' : running ? 'Still to read' : 'Not read'}
          </span>
        )}
      </span>
    </li>
  );
}

function stateNamed(state: CatalogRunState): string {
  switch (state) {
    case 'estimated':
      return 'Estimated. Nothing has been read.';
    case 'running':
      return 'Reading. You can close this page; the run carries on.';
    case 'finished':
      return 'Finished. Every Tavola it read is waiting to be checked.';
    case 'stopped-at-limit':
      return 'Stopped before the next sheet could pass the limit.';
    case 'stopped-at-usage-limit':
      return 'Stopped at the subscription’s usage limit.';
    case 'failed':
      return 'Failed.';
  }
}

function dollars(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
