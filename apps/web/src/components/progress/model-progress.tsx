import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Counting, Fraction } from '@/components/progress/tally';
import { api, type TavolaProgress, type TavolaSummary } from '@/lib/api';

/**
 * **Where the work stands across one car**, so an evening can be spent on the sheet that needs
 * it rather than on the one that happens to be first.
 *
 * The form is a printed tally and not a dashboard: a ruled table, the counts right-aligned in
 * the mono face this archive sets every factory number in, and beside each a rule that stops
 * where the work stopped. Sixty drawings compared by the length of a line is a glance; sixty
 * compared by reading sixty pairs of numbers is not — and the numbers are printed anyway, for
 * whoever wants the number rather than the impression.
 *
 * **Counted in the database, in one request.** A Tavola's own progress needs none at all, because
 * the sheet and its index are already in the browser showing them; sixty sheets are not, and
 * reading sixty drawings to print a table of counts is the thing this endpoint exists to avoid.
 */
export function ModelProgress({ modelId, tavole }: { modelId: string; tavole: TavolaSummary[] }) {
  const { data, isPending, error } = useQuery({
    queryKey: ['model-progress', modelId],
    queryFn: () => api.modelProgress(modelId),
  });

  // Named by id alone on the wire, because this list is what holds their numbers and names —
  // carrying them on the counts as well would be the same fact twice, free to disagree.
  const counted = new Map((data?.tavole ?? []).map((progress) => [progress.tavolaId, progress]));

  return (
    <section aria-labelledby="model-progress" data-testid="model-progress">
      <h2 id="model-progress" className="label">
        Where the work stands
      </h2>
      <p className="mt-2 max-w-measure text-sm text-pretty text-muted">
        Every drawing of this car, in the catalog’s own order, and how much of each has been
        recorded. Which to do next is yours to decide.
      </p>
      {/*
       * **The counts are counts, and not a score.** The factory listed plenty of numbers it never
       * drew, and a sheet whose last two are of that kind is finished at 8 of 10 — so this says so
       * here rather than letting sixty rules that stop short imply otherwise sixty times.
       */}
      <p className="mt-2 max-w-measure text-xs text-pretty text-faint">
        A number the catalog lists that the factory never drew is finished with no circle on it, so
        a sheet can be done without either count reaching the whole.
      </p>

      <Counting isPending={isPending} error={error} />

      {data && (
        <table className="tally-table mt-6">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="label py-3 pr-4 text-left">
                Tavola
              </th>
              <th scope="col" className="label py-3 pl-4 text-right">
                Marked
              </th>
              <th scope="col" className="label py-3 pl-4 text-right">
                Listed
              </th>
            </tr>
          </thead>
          <tbody>
            {tavole.map((tavola) => (
              <SheetRow key={tavola.id} tavola={tavola} progress={counted.get(tavola.id)} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/**
 * One drawing's line of the tally.
 *
 * **The number and the name are one link**, because a row of counts an Editor cannot act on is a
 * report rather than a way in: the point of reading this is to go and do one of them.
 *
 * There is deliberately no column for how many numbers the sheet carries. It is the denominator
 * of both fractions beside it, and a column printing it a third time is a column of the same fact.
 */
function SheetRow({ tavola, progress }: { tavola: TavolaSummary; progress?: TavolaProgress }) {
  // A Tavola the counts do not mention is one recorded between the two requests this page makes,
  // and a sheet created a moment ago genuinely has nothing on it — so the empty reading is the
  // true one rather than a hole being papered over.
  const positions = progress?.positions ?? 0;

  return (
    <tr
      data-testid="model-progress-row"
      data-tavola={tavola.number}
      className="border-b border-line transition-colors duration-150 ease-[var(--ease-out-quick)] hover:bg-surface-sunken"
    >
      <th scope="row" className="py-2 pr-4 text-left font-normal">
        <Link
          to="/tavole/$tavolaId"
          params={{ tavolaId: tavola.id }}
          className="flex min-h-control flex-wrap items-baseline gap-x-4 gap-y-1 hover:text-accent-ink"
        >
          {/* An identifier, and it does not wrap: `12 bis` broken over two lines is two numbers. */}
          <span className="tabular text-base whitespace-nowrap">{tavola.number}</span>
          <span className="min-w-0 text-sm text-pretty text-muted">{tavola.nameEn}</span>
          {/*
           * **Beyond the boxes, and the most useful thing here.** A sheet with no scan cannot be
           * marked at all, so its empty counts are not an evening waiting to be spent — they are a
           * scanner waiting to be found, which is somebody else's evening entirely. Read off the
           * list this table is already given; it costs no request and no column.
           */}
          {tavola.scan === null && (
            <span className="tag" data-testid="no-scan">
              No scan
            </span>
          )}
        </Link>
      </th>
      <Tally of={progress?.marked ?? 0} outOf={positions} testId="row-marked" />
      <Tally of={progress?.listed ?? 0} outOf={positions} testId="row-listed" />
    </tr>
  );
}

/**
 * A count, and the rule that draws it.
 *
 * **A sheet with no numbers on it gets a dash and no rule**, because there is nothing to be a
 * fraction of — an empty rule would read as "none of it done" about a drawing nobody has opened,
 * which is a different thing and a discouraging way to say it. The room the rule takes is kept
 * either way, in `.tally` and in one place, so a catalog of sheets in three different states is
 * still a ruled table rather than a ragged one.
 */
function Tally({ of, outOf, testId }: { of: number; outOf: number; testId: string }) {
  const drawn = outOf > 0;

  return (
    <td className="py-2 pl-4 align-middle">
      <div className="tabular text-right text-base" data-testid={testId}>
        {drawn ? <Fraction of={of} outOf={outOf} /> : <span className="text-faint">—</span>}
      </div>
      <div className="tally mt-2" data-drawn={drawn} aria-hidden="true">
        {/* A measurement rather than a design value, which is why it is written here. */}
        {drawn && <span style={{ width: `${(of / outOf) * 100}%` }} />}
      </div>
    </td>
  );
}
