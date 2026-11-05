import type { Tour } from '../tour-steps';

/** **Spending**: this month against the Monthly limit, before a reading, and at the limit. For Administrators. */
const steps: Tour['steps'] = [
  {
    part: null,
    title: 'Something new: Spending',
    body: (where) => (
      <>
        <p>
          What Ricambi spends on Claude, for Proposals’ conversations and for reading the catalogue,
          is now in one place, against the <b>Monthly limit</b>: the most it may spend in a calendar
          month. About five minutes:
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>Read this month’s spending.</li>
          <li>See what is left before starting a reading.</li>
          <li>Learn what happens when the month’s limit is reached.</li>
        </ol>
        {where.known && !where.isAdministrator && (
          <p className="mt-3 font-semibold">
            Spending is for Administrators only. Sign in as one to walk this tour.
          </p>
        )}
      </>
    ),
    next: 'Start',
  },
  {
    part: 'month',
    title: 'Open Spending',
    body: (
      <p>
        Press <b>Spending</b> at the top. It is there for Administrators only.
      </p>
    ),
    go: {
      to: '/spending',
      label: 'Go to Spending',
      unless: (where) => where.path === '/spending',
    },
    done: (where) => where.path === '/spending',
  },
  {
    part: 'month',
    title: 'This month, at a glance',
    body: (
      <>
        <p>
          The large figure is what this month has cost so far, with a bar against the Monthly limit.
          Beneath it, what went to Proposals and what to Catalog runs, and the past twelve months.
        </p>
        <p className="mt-3">
          These are Ricambi’s own estimates at list prices. The bill itself is in the Claude
          Console, linked at the top. Where nothing is billed, as on a developer’s own subscription,
          the figures say what it <i>would have cost</i>, and there is no bar.
        </p>
      </>
    ),
    next: 'Next',
  },
  {
    part: 'start',
    title: 'Before starting a reading',
    body: (
      <>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Choose any catalogue PDF, a Model and a page or two, and press <b>Estimate the cost</b>.
          </li>
          <li>Under the spending limit, read what is left of this month’s Monthly limit.</li>
          <li>Enter a limit larger than that, and read the warning.</li>
        </ol>
        <p className="mt-3">
          You don’t need to start it: a reading here costs real money. The warning never stops you;
          the Monthly limit itself does, at the provider.
        </p>
        <p className="mt-3 text-muted">
          Nothing shows where no Monthly limit is known, or where nothing is billed.
        </p>
      </>
    ),
    go: {
      to: '/readings',
      label: 'Go to Readings',
      unless: (where) => where.path === '/readings',
    },
    next: 'I’ve seen it',
  },
  {
    part: 'limit',
    title: 'When the month runs out',
    body: (
      <p>
        A reading that reaches the Monthly limit stops, as it does at its own limit, and says so:
        <b> Stopped: this month’s limit on spending with Claude is reached.</b> Everything read so
        far is kept, and <b>Continue reading</b> carries it on next month, or once the limit is
        raised.
      </p>
    ),
    next: 'Next',
  },
  {
    part: null,
    title: 'That’s all of it',
    body: (
      <p>
        Spending stays at the top for Administrators, and the Proposals page links to it. Anything
        unclear or wrong along the way: reply to the e-mail this tour came with.
      </p>
    ),
    next: 'End the tour',
  },
];

export const spendingTour: Tour = {
  footer: 'Tour: Spending',
  parts: [
    { part: 'month', name: 'This month' },
    { part: 'start', name: 'Starting' },
    { part: 'limit', name: 'At the limit' },
  ],
  steps,
};
