import type {
  CatalogRun,
  CatalogRunCostRecord,
  CatalogRunCutOffRequest,
  CatalogRunSheetCost,
  CatalogRunSpent,
} from '@ricambi/contracts';
import { dollars } from '@/lib/readings';

/**
 * **The record of a Catalog run** (issue #62): what `cost.json` held, shown where the run is. The
 * total stands beside the estimate and the limit it was held to, then what the prices were and
 * when they were checked, then every Tavola down to each request: asking what a page is, each
 * Reading, the drawing's numbers read into Marks, and the translation.
 *
 * A run continued after a stop read more than once; each time is its own table, as each was its
 * own record, so a Tavola read again whole shows what it cost both times.
 *
 * A request whose answer was cut off by a restart was paid for all the same. It has a row of its
 * own at the most it could cost, which is why a total can be more than its answers (issue #66).
 */
export function RunCosts({ run }: { run: CatalogRun }) {
  if (run.costs.length === 0) {
    return null;
  }
  const [latest] = run.costs.slice(-1);
  return (
    <section className="mt-12" aria-labelledby="run-costs" data-testid="run-costs">
      <h2 id="run-costs" className="label">
        Record
      </h2>

      <dl className="mt-4 grid max-w-md grid-cols-3 gap-4">
        <Figure term={run.charged ? 'Spent' : 'Would have cost'} amount={run.spent} />
        <Figure term="Estimate" amount={run.estimate} />
        <Figure term="Limit" amount={run.limit} />
      </dl>

      <p className="mt-6 text-pretty text-muted">
        {methodNamed(run)}
        {latest && (
          <>
            {' '}
            Priced from the {latest.priceList.model} list prices checked on{' '}
            <span className="tabular">{latest.priceList.checkedOn}</span>:{' '}
            <span className="tabular">
              {latest.priceList.inputPerMillion} {latest.priceList.currency}
            </span>{' '}
            a million tokens in,{' '}
            <span className="tabular">
              {latest.priceList.outputPerMillion} {latest.priceList.currency}
            </span>{' '}
            a million out.
          </>
        )}
      </p>

      {run.costs.map((record) => (
        <Time key={record.time} record={record} only={run.costs.length === 1} />
      ))}
    </section>
  );
}

function Figure({ term, amount }: { term: string; amount: number | null }) {
  return (
    <div>
      <dt className="label">{term}</dt>
      <dd className="tabular mt-1 text-2xl text-text">
        {amount === null ? <span className="text-faint">None</span> : dollars(amount)}
      </dd>
    </div>
  );
}

function methodNamed({ readingMethod, charged }: CatalogRun): string {
  if (!charged) {
    const what = readingMethod === 'fake' ? 'the practice method' : 'a subscription';
    return `Read with ${what}, not charged: every figure is what it would have cost at list prices.`;
  }
  return 'Read with the API key, and charged.';
}

/** One time the run read, as one table: a body for each Tavola, a row for each of its pages. */
function Time({ record, only }: { record: CatalogRunCostRecord; only: boolean }) {
  return (
    <div className="mt-8" data-testid="run-cost-record">
      {!only && (
        <h3 className="text-lg font-medium text-text">
          {record.time === 1 ? 'Started' : `Continued, time ${record.time}`}:{' '}
          <span className="tabular">{dollars(record.total)}</span>
        </h3>
      )}
      {record.stopped && <p className="mt-1 text-pretty text-muted">{stoppedNamed(record)}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="cost-table">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="label py-3 pr-4 text-left">
                Page
              </th>
              <th scope="col" className="label py-3 pl-3">
                Asked
              </th>
              <th scope="col" className="label py-3 pl-3">
                Reading 1
              </th>
              <th scope="col" className="label py-3 pl-3">
                Reading 2
              </th>
              <th scope="col" className="label py-3 pl-3">
                Marks
              </th>
              <th scope="col" className="label py-3 pl-3">
                Cost
              </th>
            </tr>
          </thead>
          {record.tavole.map((tavola) => (
            <tbody key={tavola.number} className="border-b border-line">
              <tr>
                <th scope="rowgroup" colSpan={5} className="pt-4 pr-4 pb-1 text-left font-medium">
                  Tavola {tavola.number}
                  {!tavola.finished && (
                    <span className="font-normal text-muted">, not read whole</span>
                  )}
                </th>
                <td className="tabular pt-4 pb-1 pl-3 font-medium text-text">
                  {dollars(tavola.cost)}
                </td>
              </tr>
              {tavola.sheets.map((sheet) => (
                <SheetRow key={sheet.page} sheet={sheet} />
              ))}
              {tavola.translation && (
                <tr className="text-muted">
                  <th scope="row" colSpan={5} className="py-1 pr-4 text-left font-normal">
                    Translation
                  </th>
                  <Cell spent={tavola.translation} />
                </tr>
              )}
              <tr aria-hidden="true">
                <td colSpan={6} className="pb-3" />
              </tr>
            </tbody>
          ))}
          {record.setAside.length > 0 && (
            <tbody className="border-b border-line">
              <tr>
                <th scope="rowgroup" colSpan={6} className="pt-4 pr-4 pb-1 text-left font-medium">
                  Set aside
                </th>
              </tr>
              {record.setAside.map((page) => (
                <tr key={page.page} className="text-muted">
                  <th scope="row" className="py-1 pr-4 text-left font-normal">
                    Page {page.page}
                  </th>
                  <Cell spent={page.identification} />
                  <td colSpan={3} />
                  <Cell spent={page.identification} />
                </tr>
              ))}
              <tr aria-hidden="true">
                <td colSpan={6} className="pb-3" />
              </tr>
            </tbody>
          )}
          {record.cutOff.length > 0 && (
            <tbody className="border-b border-line" data-testid="run-cost-cut-off">
              <tr>
                <th scope="rowgroup" colSpan={6} className="pt-4 pr-4 pb-1 text-left font-medium">
                  Cut off
                  <span className="block font-normal text-pretty text-muted">
                    Sent, but the server went away before the answer came back. Each is counted at
                    the most it could cost.
                  </span>
                </th>
              </tr>
              {record.cutOff.map((request, index) => (
                <tr key={index} className="text-muted">
                  <th scope="row" colSpan={5} className="py-1 pr-4 text-left font-normal">
                    {requestNamed(request)}
                  </th>
                  <td className="tabular py-1 pl-3 text-text">{dollars(request.cost)}</td>
                </tr>
              ))}
              <tr aria-hidden="true">
                <td colSpan={6} className="pb-3" />
              </tr>
            </tbody>
          )}
          <tfoot>
            <tr>
              <th scope="row" colSpan={5} className="py-3 pr-4 text-left font-medium">
                Total
              </th>
              <td className="tabular py-3 pl-3 font-medium text-text">{dollars(record.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function SheetRow({ sheet }: { sheet: CatalogRunSheetCost }) {
  const reading = (which: 1 | 2) => sheet.readings.find((spent) => spent.reading === which);
  const marks = sheet.marks.reduce<CatalogRunSpent | undefined>(
    (sum, spent) => ({
      input: (sum?.input ?? 0) + spent.input,
      output: (sum?.output ?? 0) + spent.output,
      cost: (sum?.cost ?? 0) + spent.cost,
    }),
    undefined,
  );
  return (
    <tr className="text-muted" data-testid="run-cost-sheet">
      <th scope="row" className="py-1 pr-4 text-left font-normal">
        Page {sheet.page}, {sheet.kind === 'table' ? 'Table sheet' : 'drawing'}
      </th>
      <Cell spent={sheet.identification} />
      <Cell spent={reading(1)} />
      <Cell spent={reading(2)} />
      <Cell spent={marks} />
      <td className="tabular py-1 pl-3 text-text">{dollars(sheet.cost)}</td>
    </tr>
  );
}

/** One request's cost, its tokens a hover away; nothing asked is a faint dash. */
function Cell({ spent }: { spent: CatalogRunSpent | undefined }) {
  if (!spent || (spent.input === 0 && spent.output === 0)) {
    return (
      <td className="tabular py-1 pl-3 text-faint">
        <span aria-hidden="true">–</span>
        <span className="sr-only">Nothing</span>
      </td>
    );
  }
  return (
    <td
      className="tabular py-1 pl-3"
      title={`${spent.input.toLocaleString('en-GB')} tokens in, ${spent.output.toLocaleString('en-GB')} out`}
    >
      {dollars(spent.cost)}
    </td>
  );
}

function requestNamed({ request, page, tavola, reading }: CatalogRunCutOffRequest): string {
  switch (request) {
    case 'identification':
      return `Page ${page}, asked what it is`;
    case 'reading':
      return `Page ${page}, Reading ${reading} of Tavola ${tavola}`;
    case 'numbers':
      return `Page ${page}, the drawing’s numbers for Marks`;
    case 'translation':
      return `Translating Tavola ${tavola}`;
  }
}

function stoppedNamed({ stopped }: CatalogRunCostRecord): string {
  switch (stopped) {
    case 'spending-limit':
      return 'It stopped before the next request could pass the limit.';
    case 'usage-limit':
      return 'It stopped at the subscription’s usage limit.';
    case 'method-failed':
      return 'It stopped when the model failed or declined to answer.';
    case 'asked':
      return 'It stopped because an Administrator asked it to.';
    case null:
      return '';
  }
}
