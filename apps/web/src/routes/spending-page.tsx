import type { SpendingMonth, SpendingPurpose, SpendingResponse } from '@ricambi/contracts';
import { AdministratorsOnly } from '@/components/roster/administrators-only';
import { Refusal } from '@/components/ui/field';
import { refusalText } from '@/lib/api';
import { dollars } from '@/lib/readings';
import { CONSOLE_COST_URL, PURPOSE_NAME, monthName, useSpending } from '@/lib/spending';

/**
 * **Spending** (issue #189): what Ricambi has spent on Claude this month, against the Monthly
 * limit, then what it was for, then the past twelve months. The one figure that matters is said
 * large over the bar a Catalog run's spending is drawn with; the rest is plain. Everything here is
 * Ricambi's own estimate at list prices, and the page says so: the bill is in the Console.
 */
export function SpendingPage() {
  return (
    <AdministratorsOnly what="Spending">
      <Spending />
    </AdministratorsOnly>
  );
}

function Spending() {
  const spending = useSpending();

  return (
    <div className="animate-rise">
      <h1 className="display text-4xl tracking-display sm:text-5xl">Spending</h1>
      <p className="mt-4 max-w-measure text-lg text-pretty text-muted">
        What Ricambi has spent on Claude, by the calendar month in UTC. Ricambi’s own estimates at
        list prices, from what it sent.
      </p>

      {spending.isPending ? (
        <p className="mt-10 text-lg text-muted" role="status">
          Reading what was spent…
        </p>
      ) : spending.isError ? (
        <div className="mt-10">
          <Refusal>{refusalText(spending.error)}</Refusal>
        </div>
      ) : (
        <>
          <ThisMonth spending={spending.data} />
          <Split month={spending.data.thisMonth} />
          <Months months={spending.data.months} />
          <p className="mt-12 max-w-measure text-pretty text-muted">
            The bill itself is in the{' '}
            <a
              href={CONSOLE_COST_URL}
              target="_blank"
              rel="noreferrer"
              className="text-accent-ink underline underline-offset-4"
              data-testid="spending-console"
            >
              Claude Console
            </a>
            .
          </p>
        </>
      )}
    </div>
  );
}

/**
 * This month against the Monthly limit. No bar where nothing was billed, since a subscription's
 * figures never meet the workspace's limit, and none where no limit is known.
 */
function ThisMonth({ spending }: { spending: SpendingResponse }) {
  const { thisMonth, monthlyLimitUsd } = spending;
  const { totalUsd, billed } = thisMonth;
  const bar = billed && monthlyLimitUsd !== null;
  const share = monthlyLimitUsd === null ? 0 : Math.min(1, totalUsd / monthlyLimitUsd);
  return (
    <section
      className="mt-12"
      aria-labelledby="spending-this-month"
      data-testid="spending-this-month"
    >
      <h2 id="spending-this-month" className="label">
        {monthName(thisMonth.month)}
      </h2>
      <p
        className="display tabular mt-3 text-6xl tracking-display text-text"
        data-testid="spending-total"
      >
        {dollars(totalUsd)}
      </p>
      <p className="mt-2 max-w-measure text-pretty text-muted" data-testid="spending-against">
        {billed ? 'spent this month' : 'would have cost this month, and was not billed'}
        {monthlyLimitUsd === null ? (
          <>. No Monthly limit is known: Ricambi is told it in ANTHROPIC_MONTHLY_LIMIT_USD.</>
        ) : (
          <>
            , of a Monthly limit of{' '}
            <span className="tabular text-text">{dollars(monthlyLimitUsd)}</span>.
          </>
        )}
      </p>
      {bar && (
        <div
          role="meter"
          aria-label="Spent against the Monthly limit"
          aria-valuemin={0}
          aria-valuemax={monthlyLimitUsd}
          aria-valuenow={totalUsd}
          className="mt-6 h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
        >
          <div
            className="h-full rounded-full bg-text transition-[width] duration-500 ease-[var(--ease-out-quick)] motion-reduce:transition-none"
            style={{ width: `${share * 100}%` }}
          />
        </div>
      )}
    </section>
  );
}

/** What this month's spending was for. */
function Split({ month }: { month: SpendingMonth }) {
  const purposes = Object.keys(PURPOSE_NAME) as SpendingPurpose[];
  return (
    <section className="mt-12" aria-labelledby="spending-split">
      <h2 id="spending-split" className="label">
        What it was for
      </h2>
      <dl className="mt-4 grid max-w-md grid-cols-2 gap-4" data-testid="spending-split">
        {purposes.map((purpose) => (
          <div key={purpose}>
            <dt className="text-muted">{PURPOSE_NAME[purpose]}</dt>
            <dd className="tabular mt-1 text-2xl text-text">{dollars(month.byPurpose[purpose])}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The past twelve months, this one first: a column for each purpose, and the total. */
function Months({ months }: { months: SpendingMonth[] }) {
  const purposes = Object.keys(PURPOSE_NAME) as SpendingPurpose[];
  return (
    <section className="mt-12" aria-labelledby="spending-months">
      <h2 id="spending-months" className="label">
        The past twelve months
      </h2>
      <div className="mt-4 overflow-x-auto">
        <table className="cost-table" data-testid="spending-months">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="label py-3 pr-4 text-left">
                Month
              </th>
              {purposes.map((purpose) => (
                <th key={purpose} scope="col" className="label py-3 pl-3">
                  {PURPOSE_NAME[purpose]}
                </th>
              ))}
              <th scope="col" className="label py-3 pl-3">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => (
              <tr key={month.month} className="border-b border-line">
                <th scope="row" className="py-2 pr-4 text-left font-normal">
                  {monthName(month.month)}
                  {!month.billed && month.totalUsd > 0 && (
                    <span className="text-muted">, would have cost</span>
                  )}
                </th>
                {purposes.map((purpose) => (
                  <td key={purpose} className="tabular py-2 pl-3 text-muted">
                    {dollars(month.byPurpose[purpose])}
                  </td>
                ))}
                <td className="tabular py-2 pl-3 font-medium text-text">
                  {dollars(month.totalUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
