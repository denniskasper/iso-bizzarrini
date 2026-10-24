import type { CatalogRun, ReadingSetup } from '@ricambi/contracts';
import { useQuery } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { Estimating } from '@/components/readings/estimating';
import { PastRuns } from '@/components/readings/past-runs';
import { StartRun } from '@/components/readings/start-run';
import { Working } from '@/components/readings/working';
import { AdministratorsOnly } from '@/components/roster/administrators-only';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, Refusal, Select } from '@/components/ui/field';
import { api, refusalText } from '@/lib/api';
import { countPages, type PageCount } from '@/lib/pdf-pages';
import { useCatalogRun, useEstimateCatalogRun, useReadingSetup } from '@/lib/readings';

/**
 * **The Readings section** (issue #55, ADR 0018): what this server reads the factory catalog
 * with, whether that is charged, and whether reading can start at all.
 *
 * One statement is the whole of the page for now, said in the words the Club decides by:
 * "Subscription, not charged" or "API key, charged". Never the credential and never whose
 * subscription it is; the API does not know how to say either.
 *
 * Below it, a Catalog run begins (issue #57): the catalog uploaded, its Model and pages chosen,
 * and what reading them would cost, priced page by page on the server once it is stored (issue
 * #65). Once there is an estimate, starting it with a spending limit is the screen's one action
 * (issue #58), and estimating steps back.
 *
 * Last, every run there has been, each opening its record of what it cost (issue #62).
 */
export function ReadingsPage() {
  return (
    <AdministratorsOnly what="Reading the catalog">
      <Readings />
    </AdministratorsOnly>
  );
}

function Readings() {
  const setup = useReadingSetup();

  if (setup.isPending) {
    return null;
  }

  if (setup.isError) {
    return (
      <p className="text-lg text-pretty text-muted">
        What this server reads with could not be found out just now.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-measure animate-rise">
      <h1 className="display text-4xl tracking-display sm:text-5xl">Readings</h1>
      <p className="mt-6 text-lg text-pretty text-muted">
        Ricambi reads the factory catalog itself, with the one Reading method this server is given.
        Every Tavola it reads arrives Unchecked, for an Editor to check and publish.
      </p>

      <Method setup={setup.data} />

      {setup.data.available && <NewRun />}

      <PastRuns />
    </div>
  );
}

function Method({ setup }: { setup: ReadingSetup }) {
  return (
    <section
      className="mt-10 border-l-2 border-line-strong pl-4"
      aria-label="What this server reads with"
    >
      <p className="text-3xl font-semibold text-balance text-text" data-testid="reading-method">
        {named(setup)}
      </p>

      {setup.available ? (
        <p className="mt-4 text-lg text-pretty text-muted" data-testid="reading-available">
          {whatItMeans(setup)}
        </p>
      ) : (
        <div data-testid="reading-unavailable">
          <p className="mt-4 text-lg font-medium text-pretty text-text">Nothing can be read.</p>
          <p className="mt-2 text-pretty text-muted">{setup.unavailable}</p>
        </div>
      )}
    </section>
  );
}

function named({ method, charged }: ReadingSetup): string {
  const charging = charged ? 'charged' : 'not charged';
  switch (method) {
    case 'subscription':
      return `Subscription, ${charging}`;
    case 'api-key':
      return `API key, ${charging}`;
    case 'fake':
      return `Practice method, ${charging}`;
    case null:
      return 'No Reading method';
  }
}

function whatItMeans({ method }: ReadingSetup): string {
  switch (method) {
    case 'subscription':
      return 'A run is priced at list prices and shown as what it would have cost. The plan’s usage limits apply.';
    case 'api-key':
      return 'Every run is billed per use, and held to the spending limit an Administrator sets before it starts.';
    case 'fake':
      return 'It reads nothing and invents what it would have read, so a practice run costs nothing.';
    case null:
      return '';
  }
}

/**
 * **A new Catalog run, as far as its estimate.** The catalog, the car it is for and the pages to
 * read, then one press: nothing is read, and what it would cost is shown where the press was.
 * The pages are asked for rather than defaulted, so the front matter and the technical data are
 * never sent because nobody thought to leave them out. How many there are is shown the moment the
 * PDF is chosen, and a range past them is refused there and then (issue #69). A page is a whole
 * number, so nothing else can be typed into either box.
 */
function NewRun() {
  const models = useQuery({ queryKey: ['models'], queryFn: api.models });
  const estimate = useEstimateCatalogRun();
  const pickerId = useId();
  const [catalog, setCatalog] = useState<File | null>(null);
  const [count, setCount] = useState<PageCount | null>(null);
  const counting = useRef<File | null>(null);
  const [modelId, setModelId] = useState('');
  const [firstPage, setFirstPage] = useState('');
  const [lastPage, setLastPage] = useState('');

  const pages = count && 'pages' in count ? count.pages : null;
  const rangeRefused = pages === null ? null : refusedRange(firstPage, lastPage, pages);
  const ready =
    catalog !== null &&
    pages !== null &&
    rangeRefused === null &&
    modelId !== '' &&
    firstPage !== '' &&
    lastPage !== '';
  const changed =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      estimate.reset();
      set(value);
    };
  // A page is a whole number: anything else typed or pasted is not taken, rather than rounded.
  const wholePage = (set: (value: string) => void) => (value: string) => {
    if (/^\d*$/.test(value)) {
      set(value);
    }
  };
  const chosen = (file: File | null) => {
    changed(setCatalog)(file);
    setCount(null);
    counting.current = file;
    if (file) {
      void countPages(file).then((counted) => {
        // Only the PDF still chosen: one chosen after it may already have its count.
        if (counting.current === file) {
          setCount(counted);
        }
      });
    }
  };

  return (
    <section aria-labelledby="new-run" className="editor-panel registration-mark mt-16">
      <h2 id="new-run" className="label">
        Read a catalog
      </h2>
      <p className="mt-4 max-w-measure text-pretty text-muted">
        Upload the factory catalog as one PDF, and say which pages hold its Tavole. You see what
        reading them would cost before anything is read.
      </p>

      <form
        className="mt-8 flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (catalog) {
            estimate.mutate({
              catalog,
              modelId,
              firstPage: Number(firstPage),
              lastPage: Number(lastPage),
            });
          }
        }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <label htmlFor={pickerId} className={buttonVariants({ variant: 'outline' })}>
            {catalog ? 'Choose another PDF' : 'Choose the catalog PDF'}
          </label>
          <input
            id={pickerId}
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            data-testid="catalog-file"
            onChange={(event) => chosen(event.target.files?.[0] ?? null)}
          />
          {catalog && (
            <div className="flex flex-col gap-1" data-testid="catalog-chosen">
              <span className="text-sm text-pretty break-all text-muted">{catalog.name}</span>
              <span className="text-base text-text" aria-live="polite">
                {count === null ? (
                  <span className="text-muted">Counting its pages…</span>
                ) : pages !== null ? (
                  <>
                    <span className="font-semibold">
                      {pages} {pages === 1 ? 'page' : 'pages'}
                    </span>
                    <span className="text-muted">, {sizeOf(catalog.size)}</span>
                  </>
                ) : null}
              </span>
            </div>
          )}
        </div>

        {count && 'refused' in count && (
          <Refusal>{`${catalog?.name ?? 'This file'} cannot be read. ${count.refused}`}</Refusal>
        )}

        <Select
          label="Model"
          value={modelId}
          onChange={(event) => changed(setModelId)(event.target.value)}
          disabled={!models.data}
        >
          <option value="" disabled>
            Choose the car the catalog is for
          </option>
          {models.data?.models.map((model) => (
            <option key={model.id} value={model.id}>
              {[model.brand, model.name, model.series].filter(Boolean).join(' ')}
            </option>
          ))}
        </Select>

        <fieldset className="grid grid-cols-2 gap-4 sm:max-w-sm">
          <legend className="sr-only">Pages to read</legend>
          <Field
            label="From page"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            mono
            value={firstPage}
            onChange={(event) => wholePage(changed(setFirstPage))(event.target.value)}
          />
          <Field
            label="To page"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            mono
            value={lastPage}
            onChange={(event) => wholePage(changed(setLastPage))(event.target.value)}
          />
        </fieldset>

        {rangeRefused && <Refusal>{rangeRefused}</Refusal>}

        {estimate.error && <Refusal>{refusalText(estimate.error)}</Refusal>}

        <div>
          <Button
            type="submit"
            variant={estimate.data ? 'outline' : 'primary'}
            size="lg"
            disabled={!ready || estimate.isPending}
          >
            {estimate.isPending ? 'Uploading…' : 'Estimate the cost'}
          </Button>
        </div>

        {estimate.isPending && catalog && (
          <Working label="Uploading the catalog">
            Uploading {catalog.name}, {sizeOf(catalog.size)}. Ricambi prices its pages as soon as it
            has the whole file.
          </Working>
        )}
      </form>

      {estimate.data && <Estimated runId={estimate.data.run.id} />}
    </section>
  );
}

/** Why these pages cannot be read from a catalog of `pages`, or `null` where they can. */
function refusedRange(firstPage: string, lastPage: string, pages: number): string | null {
  const first = firstPage === '' ? null : Number(firstPage);
  const last = lastPage === '' ? null : Number(lastPage);
  const counted = `The catalog has ${pages} ${pages === 1 ? 'page' : 'pages'}`;
  if (first === 0 || last === 0) {
    return `${counted}, counted from 1.`;
  }
  if ((first !== null && first > pages) || (last !== null && last > pages)) {
    return `${counted}, so there is no page after ${pages} to read.`;
  }
  if (first !== null && last !== null && first > last) {
    return `${counted}. From page has to come before To page.`;
  }
  return null;
}

/** A file's size as a person reads it: kilobytes below a megabyte, megabytes above. */
function sizeOf(bytes: number): string {
  return bytes < 1_000_000
    ? `${Math.max(1, Math.round(bytes / 1000))} KB`
    : `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * The uploaded catalog's run, followed while the server prices it, then its estimate and the
 * limit to start it with. Start is offered only once the whole estimate is there.
 */
function Estimated({ runId }: { runId: string }) {
  const run = useCatalogRun(runId);
  if (!run.data) {
    return null;
  }
  const { run: current } = run.data;
  switch (current.state) {
    case 'estimating':
      return <Estimating run={current} />;
    case 'estimated':
      return (
        <>
          <Estimate run={current} />
          <StartRun run={current} />
        </>
      );
    case 'failed':
      return (
        <div className="mt-10">
          <Refusal>{current.failure ?? 'This catalog could not be estimated.'}</Refusal>
        </div>
      );
    default:
      // Started: the page is on its way to the run's own, so the estimate stays until it is.
      return <Estimate run={current} />;
  }
}

/** What the run would cost, said once, large, and then what that figure is made of. */
function Estimate({ run }: { run: CatalogRun }) {
  const pages = run.pages.last - run.pages.first + 1;
  return (
    <div role="status" className="mt-10 animate-rise" data-testid="catalog-estimate">
      <p className="display tabular text-5xl tracking-display text-text">
        {`$${run.estimate.toFixed(2)}`}
      </p>
      <p className="mt-4 max-w-measure text-lg text-pretty text-text">
        {run.charged
          ? 'is what reading it should cost, billed to the API key.'
          : 'is what reading it would cost at list prices. It is not charged.'}
      </p>
      <p className="mt-2 max-w-measure text-pretty text-muted">
        {pages} {pages === 1 ? 'page' : 'pages'}, {run.pages.first} to {run.pages.last} of{' '}
        {run.catalogPages}, for the {run.model.brand} {run.model.name}. Priced at{' '}
        <span className="tabular">{run.priceList.model}</span> list prices checked on{' '}
        <span className="tabular">{run.priceList.checkedOn}</span>. Each page is counted as
        whichever costs more: a Table sheet read twice, or a drawing with its numbers read.
      </p>
    </div>
  );
}
