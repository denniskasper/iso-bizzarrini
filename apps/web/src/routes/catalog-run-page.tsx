import type {
  CatalogRun,
  CatalogRunAction,
  CatalogRunSetAsidePage,
  CatalogRunState,
  CatalogRunTavola,
} from '@ricambi/contracts';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { StartRun } from '@/components/readings/start-run';
import { AdministratorsOnly } from '@/components/roster/administrators-only';
import { Button } from '@/components/ui/button';
import { Field, Refusal } from '@/components/ui/field';
import { refusalText } from '@/lib/api';
import { useCatalogRun, useContinueCatalogRun, useStopCatalogRun } from '@/lib/readings';

/**
 * **One Catalog run** (issue #58). The run reads on the server, so this page is somewhere to look
 * rather than something to keep open: what it has spent against its limit, said large, and each
 * Tavola it has found, with what it cost and a way to its Unchecked page as soon as it is there.
 *
 * Its one action follows its state (issue #59): Stop while it reads, Continue once it has stopped,
 * with a higher limit where the limit is what stopped it. Below, the pages it set aside rather than
 * guess their Tavola (issue #60), and who did what to it, and when.
 *
 * A run that reads one Unchecked Tavola again (issue #61) is the same page, named for that Tavola,
 * and while it is only estimated, starting it with a limit is the one action.
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
  return (
    <>
      <h1 className="display mt-4 text-4xl tracking-display text-balance sm:text-5xl">
        {run.readsAgain
          ? `Tavola ${run.readsAgain.tavola} of the ${run.model.brand} ${run.model.name}, read again`
          : `The ${run.model.brand} ${run.model.name} catalog`}
      </h1>
      <p className="mt-4 text-lg text-pretty text-muted">
        {pagesRead(run)}{' '}
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
        {stopping(run) ? 'Stopping before its next request.' : stateNamed(run.state)}
      </p>
      {run.failure && (
        <p className={`mt-2 text-pretty ${run.state === 'failed' ? 'text-alarm' : 'text-muted'}`}>
          {run.failure}
        </p>
      )}

      {run.state === 'estimated' && <StartRun run={run} />}
      {run.state === 'running' && !stopping(run) && <Stop run={run} />}
      {STOPPED.includes(run.state) && <Continue key={String(run.limit)} run={run} />}

      <Tavole run={run} />
      <SetAside pages={run.setAside} />
      <Actions actions={run.actions} />
    </>
  );
}

/** Which pages it reads: a range of the catalog, or the pages one Tavola was found on. */
function pagesRead(run: CatalogRun): string {
  if (run.readsAgain) {
    const { pages } = run.readsAgain;
    return pages.length === 1
      ? `Only its page of the catalog, page ${pages[0]}.`
      : `Only its pages of the catalog, ${pages.slice(0, -1).join(', ')} and ${pages.at(-1)}.`;
  }
  const pages = run.pages.last - run.pages.first + 1;
  return `${pages} ${pages === 1 ? 'page' : 'pages'}, ${run.pages.first} to ${run.pages.last}.`;
}

const STOPPED: CatalogRunState[] = [
  'stopped-at-limit',
  'stopped-at-usage-limit',
  'stopped-after-failures',
  'stopped-by-administrator',
];

/** Stop has been pressed, and the run has yet to reach its next request. */
function stopping(run: CatalogRun): boolean {
  return run.state === 'running' && run.actions.at(-1)?.action === 'stopped';
}

/**
 * Stopping is a brake, not progress, so it is a plain button rather than the accent: the run
 * finishes the request in hand, keeps every Tavola it has read, and can be continued.
 */
function Stop({ run }: { run: CatalogRun }) {
  const stop = useStopCatalogRun();
  return (
    <div className="mt-6 flex flex-col gap-3">
      <div>
        <Button
          size="lg"
          disabled={stop.isPending}
          onClick={() => {
            stop.mutate(run.id);
          }}
        >
          {stop.isPending ? 'Stopping…' : 'Stop reading'}
        </Button>
      </div>
      {stop.error && <Refusal>{refusalText(stop.error)}</Refusal>}
    </div>
  );
}

/**
 * Continuing a stopped run: the screen's one action. Where the limit stopped it, a higher one is
 * asked for first, and there is still no default.
 */
function Continue({ run }: { run: CatalogRun }) {
  const carryOn = useContinueCatalogRun();
  const needsRaise = run.state === 'stopped-at-limit';
  const [limit, setLimit] = useState('');
  const dollarsGiven = Number(limit);
  const raising = limit !== '';

  return (
    <form
      className="mt-6 flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        carryOn.mutate({ runId: run.id, limit: raising ? dollarsGiven : undefined });
      }}
    >
      {needsRaise && (
        <Field
          label="New spending limit, in dollars"
          hint={`Above the present ${dollars(run.limit ?? 0)}. What it has spent counts against it.`}
          type="number"
          inputMode="decimal"
          min={0.01}
          step={0.01}
          mono
          className="sm:max-w-xs"
          value={limit}
          onChange={(event) => {
            carryOn.reset();
            setLimit(event.target.value);
          }}
        />
      )}

      {carryOn.error && <Refusal>{refusalText(carryOn.error)}</Refusal>}

      <div>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={carryOn.isPending || (needsRaise && !(dollarsGiven > 0))}
        >
          {carryOn.isPending
            ? 'Continuing…'
            : needsRaise
              ? 'Raise the limit and continue'
              : 'Continue reading'}
        </Button>
      </div>
    </form>
  );
}

/** Who started, raised, continued and stopped the run, and when, oldest first. */
function Actions({ actions }: { actions: CatalogRunAction[] }) {
  if (actions.length === 0) {
    return null;
  }
  return (
    <section className="mt-12" aria-labelledby="run-actions">
      <h2 id="run-actions" className="label">
        Who did what
      </h2>
      <ul className="mt-4 flex flex-col gap-2 text-pretty text-muted" data-testid="run-actions">
        {actions.map((action, index) => (
          <li key={index}>
            <span className="text-text">{actionNamed(action)}</span>{' '}
            <time className="tabular" dateTime={action.at}>
              {when(action.at)}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}

function actionNamed({ action, by, limit }: CatalogRunAction): string {
  const who = by ? by.name : 'the server, after it restarted';
  switch (action) {
    case 'started':
      return `Started by ${who}, with a limit of ${dollars(limit ?? 0)},`;
    case 'raised':
      return `Limit raised to ${dollars(limit ?? 0)} by ${who},`;
    case 'continued':
      return `Continued by ${who},`;
    case 'stopped':
      return `Stopped by ${who},`;
  }
}

function when(at: string): string {
  return new Date(at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
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

/**
 * The pages the run placed in no Tavola, each with why and the page itself, small: enough to
 * recognise, and opened whole to read its number by eye.
 */
function SetAside({ pages }: { pages: CatalogRunSetAsidePage[] }) {
  if (pages.length === 0) {
    return null;
  }
  return (
    <section className="mt-12" aria-labelledby="run-set-aside">
      <h2 id="run-set-aside" className="label">
        Set aside
      </h2>
      <p className="mt-2 text-pretty text-muted">
        Pages it put into no Tavola. Their Tavola number is never guessed.
      </p>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {pages.map((page) => (
          <SetAsideLine key={page.page} page={page} />
        ))}
      </ul>
    </section>
  );
}

function SetAsideLine({ page }: { page: CatalogRunSetAsidePage }) {
  return (
    <li className="flex items-start gap-4 py-3" data-testid="run-set-aside-page">
      <a
        href={page.image}
        target="_blank"
        rel="noreferrer"
        className="shrink-0"
        aria-label={`Open page ${page.page}`}
      >
        <img
          src={page.image}
          alt=""
          loading="lazy"
          className="h-28 w-20 rounded-sm border border-line bg-surface-sunken object-contain"
        />
      </a>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-lg font-medium text-text">Page {page.page}</span>
        <span className="text-pretty text-muted">{page.reason}</span>
        <a
          href={page.image}
          target="_blank"
          rel="noreferrer"
          className="-my-2 inline-flex min-h-control items-center self-start text-accent-ink underline underline-offset-4"
        >
          Open the page
        </a>
      </div>
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
      return 'Stopped at the subscription’s usage limit. Continue once the plan reads again.';
    case 'stopped-after-failures':
      return 'Stopped: the model failed or declined to answer. The server has logged what it said.';
    case 'stopped-by-administrator':
      return 'Stopped. Every Tavola it read is kept.';
    case 'failed':
      return 'Failed.';
  }
}

function dollars(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
