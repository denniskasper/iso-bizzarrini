import type { CatalogRunListed, CatalogRunState } from '@ricambi/contracts';
import { Link } from '@tanstack/react-router';
import { dollars, useCatalogRuns } from '@/lib/readings';

/**
 * **Every Catalog run, the latest first** (issue #62). Each line is one link to the run's page and
 * its record: the car and when, where it stands, what it cost and what read it.
 */
export function PastRuns() {
  const runs = useCatalogRuns();
  if (!runs.data || runs.data.runs.length === 0) {
    return null;
  }
  return (
    <section className="mt-16" aria-labelledby="past-runs">
      <h2 id="past-runs" className="label">
        Past runs
      </h2>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {runs.data.runs.map((run) => (
          <li key={run.id}>
            <Link
              to="/readings/runs/$runId"
              params={{ runId: run.id }}
              className="group flex min-h-control flex-wrap items-baseline gap-x-6 gap-y-1 py-3"
              data-testid="past-run"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-lg font-medium text-text underline-offset-4 group-hover:underline">
                  {named(run)}
                </span>
                <span className="text-pretty text-muted">
                  <time className="tabular" dateTime={run.startedAt ?? run.createdAt}>
                    {new Date(run.startedAt ?? run.createdAt).toLocaleDateString('en-GB', {
                      dateStyle: 'medium',
                    })}
                  </time>
                  , {stateNamed(run.state)}
                  {run.removed > 0 && (
                    <>
                      , {run.removed} {run.removed === 1 ? 'Tavola' : 'Tavole'} removed since
                    </>
                  )}
                </span>
              </span>
              <span className="ml-auto flex flex-col items-end">
                <span className="tabular text-lg text-text">
                  {dollars(beforeReading(run) ? run.estimate : run.spent)}
                </span>
                <span className="text-sm text-muted">{methodNamed(run)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function named({ model, readsAgain }: CatalogRunListed): string {
  const car = [model.brand, model.name, model.series].filter(Boolean).join(' ');
  return readsAgain ? `${car}, Tavola ${readsAgain.tavola} read again` : car;
}

function methodNamed({ readingMethod, charged, state }: CatalogRunListed): string {
  const what =
    readingMethod === 'subscription'
      ? 'Subscription'
      : readingMethod === 'api-key'
        ? 'API key'
        : 'Practice method';
  const estimate =
    state === 'estimated' ? ', estimate' : state === 'estimating' ? ', estimate so far' : '';
  return `${what}, ${charged ? 'charged' : 'not charged'}${estimate}`;
}

/** Not yet started, so its figure is what it is estimated at rather than what it has spent. */
function beforeReading({ state }: CatalogRunListed): boolean {
  return state === 'estimating' || state === 'estimated';
}

function stateNamed(state: CatalogRunState): string {
  switch (state) {
    case 'estimating':
      return 'being estimated';
    case 'estimated':
      return 'estimated, not started';
    case 'running':
      return 'reading';
    case 'finished':
      return 'finished';
    case 'stopped-at-limit':
      return 'stopped at its limit';
    case 'stopped-at-usage-limit':
      return 'stopped at the usage limit';
    case 'stopped-at-monthly-limit':
      return 'stopped at this month’s limit';
    case 'stopped-after-failures':
      return 'stopped after the model failed';
    case 'stopped-by-administrator':
      return 'stopped by an Administrator';
    case 'failed':
      return 'failed';
  }
}
