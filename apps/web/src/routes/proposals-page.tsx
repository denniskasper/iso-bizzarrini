import type { ProposalCosts, ProposalListing, ProposalStatus } from '@ricambi/contracts';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Refusal } from '@/components/ui/field';
import { refusalText } from '@/lib/api';
import { KIND_NAME, STATUS_NAME, usd, useProposals } from '@/lib/proposals';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

/** What the list can be narrowed to, in the order a Proposal moves through them. */
const FILTERS: (ProposalStatus | undefined)[] = [undefined, 'new', 'taken-up', 'done', 'declined'];

/**
 * **Every handed-over Proposal** (issue #153), New first, for everybody an Administrator has let
 * propose: the developer sees what is waiting, and an author sees what became of theirs and of
 * everybody else's. A Draft is not here; it is in the Propose panel, its author's alone.
 */
export function ProposalsPage() {
  const { account } = useSession();
  const { status } = useSearch({ from: '/proposals' });
  const navigate = useNavigate({ from: '/proposals' });
  const proposals = useProposals(status);

  if (!account?.mayPropose) {
    return (
      <div className="animate-rise">
        <h1 className="display text-4xl tracking-display sm:text-5xl">Proposals</h1>
        <p className="mt-6 max-w-measure text-lg text-pretty text-muted">
          Proposals are read by those an Administrator has let propose, on a practice system.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <h1 className="display text-4xl tracking-display sm:text-5xl">Proposals</h1>
      <p className="mt-4 max-w-measure text-lg text-pretty text-muted">
        Every Fix and Idea handed over, and what became of it. New ones are at the top.
      </p>

      {proposals.data?.costs && <Costs costs={proposals.data.costs} />}

      <div
        role="group"
        aria-label="Show"
        className="mt-8 flex flex-wrap gap-2"
        data-testid="proposal-filter"
      >
        {FILTERS.map((filter) => (
          <button
            key={filter ?? 'all'}
            type="button"
            aria-pressed={status === filter}
            onClick={() =>
              void navigate({ search: filter === undefined ? {} : { status: filter } })
            }
            className={cn(
              'inline-flex h-control items-center rounded-full border px-4 text-sm',
              status === filter
                ? 'border-text bg-text text-surface'
                : 'border-line-strong text-muted hover:border-text hover:text-text',
            )}
          >
            {filter === undefined ? 'All' : STATUS_NAME[filter]}
          </button>
        ))}
      </div>

      {proposals.isPending ? (
        <p className="mt-8 text-lg text-muted" role="status">
          Reading the Proposals…
        </p>
      ) : proposals.isError ? (
        <div className="mt-8">
          <Refusal>{refusalText(proposals.error)}</Refusal>
        </div>
      ) : proposals.data.handedOver.length === 0 ? (
        <p className="mt-8 max-w-measure text-lg text-pretty text-muted">
          {status === undefined
            ? 'Nothing has been handed over yet. Propose is at the top of every page.'
            : `No Proposal is ${STATUS_NAME[status]}.`}
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-line border-y border-line" data-testid="proposals">
          {proposals.data.handedOver.map((proposal) => (
            <li key={proposal.id}>
              <ProposalRow proposal={proposal} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProposalRow({ proposal }: { proposal: ProposalListing }) {
  return (
    <Link
      to="/proposals/$proposalId"
      params={{ proposalId: proposal.id }}
      className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 py-4 hover:bg-surface-sunken"
    >
      <span className="text-lg text-pretty text-text">{proposal.title ?? proposal.opening}</span>
      <StatusTag status={proposal.status} />
      <span className="text-sm text-muted">
        {KIND_NAME[proposal.kind]}
        {proposal.mine ? ', yours' : ''}
        {proposal.handedOverAt !== null && (
          <>
            , handed over <span className="tabular">{proposal.handedOverAt.slice(0, 10)}</span>
          </>
        )}
        {proposal.estimatedCostUsd !== null && (
          <>
            , about <span className="tabular">{usd(proposal.estimatedCostUsd)}</span>
          </>
        )}
      </span>
    </Link>
  );
}

/**
 * **What the conversations cost**, for an Administrator: this month against the provider's
 * limit where Ricambi is told it, last month beside it, and what one conversation comes to. The
 * one figure that matters gets the one bar; the rest is plain text.
 */
function Costs({ costs }: { costs: ProposalCosts }) {
  const { thisMonthUsd, lastMonthUsd, conversationsThisMonth, monthlyLimitUsd } = costs;
  const share = monthlyLimitUsd === null ? null : Math.min(thisMonthUsd / monthlyLimitUsd, 1);
  return (
    <section
      aria-labelledby="proposal-costs-heading"
      className="mt-8 max-w-measure border-y border-line py-5"
      data-testid="proposal-costs"
    >
      <h2 id="proposal-costs-heading" className="text-sm font-semibold text-muted">
        What the conversations cost
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-4">
        <div>
          <dt className="text-sm text-muted">This month</dt>
          <dd className="mt-1 text-2xl text-text">
            about <span className="tabular">{usd(thisMonthUsd)}</span>
            {monthlyLimitUsd !== null && (
              <span className="text-base text-muted">
                {' '}
                of <span className="tabular">{usd(monthlyLimitUsd)}</span>
              </span>
            )}
          </dd>
          {share !== null && (
            <dd className="mt-2 h-1 rounded-full bg-line" aria-hidden="true">
              <span
                className="block h-1 rounded-full bg-mark"
                style={{ width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%` }}
              />
            </dd>
          )}
        </div>
        <div>
          <dt className="text-sm text-muted">Last month</dt>
          <dd className="mt-1 text-2xl text-text">
            about <span className="tabular">{usd(lastMonthUsd)}</span>
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="sr-only">Conversations this month</dt>
          <dd className="text-sm text-muted">
            <span className="tabular">{conversationsThisMonth}</span>{' '}
            {conversationsThisMonth === 1 ? 'conversation' : 'conversations'} this month
            {conversationsThisMonth > 0 && (
              <>
                , about{' '}
                <span className="tabular">{usd(thisMonthUsd / conversationsThisMonth)}</span> each
              </>
            )}
            .
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-pretty text-muted">
        Estimated at list prices from what Ricambi sent. The bill itself is in the Anthropic
        Console.
      </p>
    </section>
  );
}

/** Where a Proposal stands. New is the one in the accent: it is what is waiting. */
export function StatusTag({ status }: { status: ProposalStatus }) {
  return (
    <span
      data-testid="proposal-status"
      className={cn(
        'text-sm font-semibold whitespace-nowrap',
        status === 'new' ? 'text-accent-ink' : 'text-muted',
      )}
    >
      {STATUS_NAME[status]}
    </span>
  );
}
