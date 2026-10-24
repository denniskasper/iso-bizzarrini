import type {
  CatalogRun,
  CatalogRunAction,
  CatalogRunSetAsidePage,
  CatalogRunState,
  CatalogRunTavola,
} from '@ricambi/contracts';
import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Estimating } from '@/components/readings/estimating';
import { RunCosts } from '@/components/readings/run-costs';
import { StartRun } from '@/components/readings/start-run';
import { Working } from '@/components/readings/working';
import { AdministratorsOnly } from '@/components/roster/administrators-only';
import { Button } from '@/components/ui/button';
import { Field, Refusal } from '@/components/ui/field';
import { refusalText } from '@/lib/api';
import { dollars, useCatalogRun, useContinueCatalogRun, useStopCatalogRun } from '@/lib/readings';

/**
 * **One Catalog run** (issue #58). The run reads on the server, so this page is somewhere to look
 * rather than something to keep open: what it has spent against its limit, said large, and each
 * Tavola it has found, with what it cost and a way to its Unchecked page as soon as it is there.
 *
 * Below the Tavole it has read, what it has not yet read (issue #64): the Tavole it stopped in the
 * middle of, and the pages it never reached.
 *
 * Its one action follows its state (issue #59): Stop while it reads, Continue once it has stopped,
 * with a higher limit where the limit is what stopped it. Below, the pages it set aside rather than
 * guess their Tavola (issue #60), its record of what each Tavola, sheet and Reading cost (issue
 * #62), and who did what to it, and when.
 *
 * A run that reads one Unchecked Tavola again (issue #61) is the same page, named for that Tavola,
 * and while it is only estimated, starting it with a limit is the one action. While its catalog is
 * still being estimated (issue #65), it says how far the estimate has got, and offers nothing.
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

      {run.state === 'estimating' && <Estimating run={run} />}
      {run.state === 'estimated' && <StartRun run={run} />}
      {run.state === 'running' && !stopping(run) && (
        <>
          <NowReading run={run} />
          <Stop run={run} />
        </>
      )}
      {STOPPED.includes(run.state) && <Continue key={String(run.limit)} run={run} />}

      <Tavole run={run} />
      <Left run={run} />
      <SetAside pages={run.setAside} />
      <RunCosts run={run} />
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
 * **What the run is on now, and for how long**, while it reads. A page takes the model a minute or
 * more, and nothing else on the page changes until a Tavola is finished, so the clock is what
 * says the run is alive between one answer and the next.
 */
function NowReading({ run }: { run: CatalogRun }) {
  const since = run.actions.findLast(
    (action) => action.action === 'started' || action.action === 'continued',
  )?.at;
  const now = useNow();
  const [tavola] = run.left.tavole;
  const [page] = run.left.pages;
  return (
    <Working label="Reading">
      {tavola !== undefined
        ? `Now on Tavola ${tavola}.`
        : page !== undefined
          ? `Now on page ${page}.`
          : 'Finishing the last Tavola.'}{' '}
      {since && (
        <span className="text-muted">
          Reading for <span className="tabular">{elapsed(since, now)}</span>.
        </span>
      )}
    </Working>
  );
}

/** The time, once a second, for a clock on the screen. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => {
      setNow(Date.now());
    }, 1_000);
    return () => {
      clearInterval(tick);
    };
  }, []);
  return now;
}

/** How long since `at`, in minutes and seconds: 0 s, 45 s, 3 min 05 s. */
function elapsed(at: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - new Date(at).getTime()) / 1_000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes === 0 ? `${rest} s` : `${minutes} min ${String(rest).padStart(2, '0')} s`;
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

/**
 * Who started, raised, continued and stopped the run, and removed a Tavola it read (issue #85),
 * and when, oldest first.
 */
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

function actionNamed({ action, by, limit, tavola }: CatalogRunAction): string {
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
    case 'removed':
      return `Tavola ${tavola ?? ''} removed by ${by ? by.name : 'an Administrator'},`;
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

/** The Tavole it has read whole, each opening its Unchecked page as soon as it is there. */
function Tavole({ run }: { run: CatalogRun }) {
  const finished = run.tavole.filter((tavola) => tavola.finished);
  if (finished.length === 0) {
    if (run.startedAt === null) {
      return null;
    }
    return (
      <p className="mt-12 text-pretty text-muted">
        {run.state === 'running'
          ? 'Each Tavola is listed here once it is read, and opens straight away.'
          : run.left.tavole.length > 0 || run.left.pages.length > 0
            ? 'It has not read a Tavola whole yet.'
            : 'This run found no Tavola to read.'}
      </p>
    );
  }
  return (
    <section className="mt-12" aria-labelledby="run-tavole">
      <h2 id="run-tavole" className="label">
        Tavole read
      </h2>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {finished.map((tavola) => (
          <TavolaLine key={tavola.number} tavola={tavola} />
        ))}
      </ul>
    </section>
  );
}

/**
 * **What it has not yet read** (issue #64): the Tavole it began and did not finish, and the pages
 * it never reached, which is what raising the limit and continuing would read. Said in one line
 * once nothing is left, rather than as two empty lists. Before the run starts, everything is left,
 * and the page says nothing of it.
 */
function Left({ run }: { run: CatalogRun }) {
  if (run.startedAt === null) {
    return null;
  }
  const costs = new Map(run.tavole.map((tavola) => [tavola.number, tavola.cost]));
  // While it reads, the first of what is left is what it is on: a Tavola it began, or else the
  // next page. Said as that, rather than as a page it has not reached.
  const reading = run.state === 'running';
  const nowTavola = reading ? run.left.tavole[0] : undefined;
  const nowPage = reading && nowTavola === undefined ? run.left.pages[0] : undefined;
  const tavole = nowTavola === undefined ? run.left.tavole : run.left.tavole.slice(1);
  const pages = nowPage === undefined ? run.left.pages : run.left.pages.slice(1);
  return (
    <section className="mt-12" aria-labelledby="run-left" data-testid="run-left">
      <h2 id="run-left" className="label">
        Left to read
      </h2>
      {nowTavola === undefined &&
      nowPage === undefined &&
      tavole.length === 0 &&
      pages.length === 0 ? (
        reading ? null : (
          <p className="mt-4 text-pretty text-text">
            Nothing is left to read: every page went into a Tavola or was set aside.
          </p>
        )
      ) : (
        <dl className="mt-4 divide-y divide-line border-y border-line">
          {(nowTavola !== undefined || nowPage !== undefined) && (
            <div
              className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6"
              data-testid="run-reading-now"
            >
              <dt className="shrink-0 text-muted sm:w-36">Reading now</dt>
              <dd className="flex flex-wrap items-baseline gap-x-6 text-lg font-medium text-text">
                {nowTavola !== undefined ? (
                  <>
                    <span>Tavola {nowTavola}</span>
                    <span className="tabular text-base font-normal text-muted">
                      {dollars(costs.get(nowTavola) ?? 0)} so far
                    </span>
                  </>
                ) : (
                  <span>
                    Page <span className="tabular">{nowPage}</span>
                  </span>
                )}
              </dd>
            </div>
          )}
          {tavole.length > 0 && (
            <div
              className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6"
              data-testid="run-unfinished"
            >
              <dt className="shrink-0 text-muted sm:w-36">Not finished</dt>
              <dd className="flex flex-col gap-1">
                {tavole.map((number) => (
                  <span key={number} className="flex flex-wrap items-baseline gap-x-6">
                    <span className="text-lg font-medium text-text">Tavola {number}</span>
                    <span className="tabular text-muted">
                      {dollars(costs.get(number) ?? 0)} so far
                    </span>
                  </span>
                ))}
              </dd>
            </div>
          )}
          {pages.length > 0 && (
            <div
              className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6"
              data-testid="run-unreached"
            >
              <dt className="shrink-0 text-muted sm:w-36">Not reached</dt>
              <dd className="text-lg font-medium text-pretty text-text">
                {pages.length === 1 ? 'Page' : 'Pages'}{' '}
                <span className="tabular">{pageRuns(pages)}</span>
              </dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

/** Pages in order, with each run of three or more said as one: 4, 5, 7 to 9. */
function pageRuns(pages: number[]): string {
  const runs: [number, number][] = [];
  for (const page of pages) {
    const last = runs.at(-1);
    if (last && page === last[1] + 1) {
      last[1] = page;
    } else {
      runs.push([page, page]);
    }
  }
  return runs
    .map(([first, last]) =>
      last - first >= 2 ? `${first} to ${last}` : first === last ? `${first}` : `${first}, ${last}`,
    )
    .join(', ');
}

function TavolaLine({ tavola }: { tavola: CatalogRunTavola }) {
  return (
    <li
      className="flex min-h-control flex-wrap items-baseline gap-x-6 gap-y-1 py-3"
      data-testid="run-tavola"
    >
      <span className="text-lg font-medium text-text">Tavola {tavola.number}</span>
      <span className="tabular text-muted">{dollars(tavola.cost)}</span>
      <span className="ml-auto text-pretty">
        {tavola.removed ? (
          <span className="text-muted">
            Removed by {tavola.removed.by?.name ?? 'an Administrator'},{' '}
            <time className="tabular" dateTime={tavola.removed.at}>
              {when(tavola.removed.at)}
            </time>
          </span>
        ) : tavola.tavolaId ? (
          <Link
            to="/tavole/$tavolaId"
            params={{ tavolaId: tavola.tavolaId }}
            className="-my-2 inline-flex min-h-control items-center text-accent-ink underline underline-offset-4"
          >
            Open, Unchecked
          </Link>
        ) : tavola.refused ? (
          <span className="text-muted">Not loaded. {tavola.refused}</span>
        ) : tavola.replacedBy ? (
          <Link
            to="/readings/runs/$runId"
            params={{ runId: tavola.replacedBy.runId }}
            className="-my-2 inline-flex min-h-control items-center text-muted underline underline-offset-4 hover:text-text"
          >
            Replaced by a later run
          </Link>
        ) : (
          <span className="text-faint">Read</span>
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
    case 'estimating':
      return 'Being estimated. Nothing has been read.';
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
