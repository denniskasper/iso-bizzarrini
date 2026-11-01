import type { Proposal } from '@ricambi/contracts';
import { Link, useParams } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import {
  ContextList,
  FinishedProposal,
  Said,
  Screenshots,
} from '@/components/proposals/proposal-parts';
import { Button } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import { refusalText } from '@/lib/api';
import { KIND_NAME, OPENING_QUESTION, usd, useDecide, useProposal } from '@/lib/proposals';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { StatusTag } from '@/routes/proposals-page';
import { Written } from '@/components/proposals/written';

/**
 * **One handed-over Proposal** (issue #153): where it stands and why, the finished Proposal, what
 * it was started from, and the whole conversation behind it. An Administrator decides here what
 * becomes of it.
 */
export function ProposalPage() {
  const { proposalId } = useParams({ from: '/proposals/$proposalId' });
  const read = useProposal(proposalId);

  return (
    <div className="animate-rise">
      <p className="text-lg text-muted">
        <Link
          to="/proposals"
          className="-my-2 inline-flex min-h-control items-center hover:text-text"
        >
          Proposals
        </Link>
      </p>
      {read.isPending ? (
        <p className="mt-6 text-lg text-muted" role="status">
          Reading the Proposal…
        </p>
      ) : read.isError ? (
        <div className="mt-6">
          <Refusal>{refusalText(read.error)}</Refusal>
        </div>
      ) : (
        <Whole proposal={read.data.proposal} />
      )}
    </div>
  );
}

function Whole({ proposal }: { proposal: Proposal }) {
  const { isAdministrator } = useSession();

  return (
    <>
      <h1 className="display mt-4 max-w-measure text-4xl tracking-display text-pretty sm:text-5xl">
        {proposal.title ?? proposal.opening ?? `A ${KIND_NAME[proposal.kind]}`}
      </h1>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-3 text-base text-muted">
        <StatusTag status={proposal.status} />
        <span>
          {KIND_NAME[proposal.kind]}
          {proposal.mine ? ', yours' : ''}
          {proposal.handedOverAt !== null && (
            <>
              , handed over <span className="tabular">{proposal.handedOverAt.slice(0, 10)}</span>
            </>
          )}
          {proposal.estimatedCostUsd !== null && (
            <>
              , cost about{' '}
              <span className="tabular" data-testid="proposal-cost">
                {usd(proposal.estimatedCostUsd)}
              </span>{' '}
              to work out
            </>
          )}
        </span>
      </p>

      {proposal.declineReason !== null && (
        <div
          className="mt-6 max-w-measure border-l-2 border-line-strong pl-4"
          data-testid="decline-reason"
        >
          <p className="text-sm font-semibold text-muted">Why it was declined</p>
          <p className="mt-1 text-lg text-pretty text-text">{proposal.declineReason}</p>
        </div>
      )}

      {isAdministrator && <Deciding proposal={proposal} />}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-label="The finished Proposal" className="max-w-measure">
          {proposal.summary === null ? (
            <p className="text-muted">There is no finished Proposal yet.</p>
          ) : (
            <FinishedProposal
              summary={proposal.summary}
              screenshots={proposal.turns.flatMap((turn) => turn.screenshots)}
            />
          )}
          <h2 className="mt-10 text-sm text-muted">Started from</h2>
          <div className="mt-2">
            <ContextList context={proposal.context} />
          </div>
        </section>

        <section aria-labelledby="conversation-heading">
          <h2 id="conversation-heading" className="text-sm text-muted">
            The conversation
          </h2>
          <ol className="mt-4 space-y-5" data-testid="conversation">
            <Said speaker="conversation">{OPENING_QUESTION[proposal.kind]}</Said>
            {proposal.turns.map((turn) => (
              <Said
                key={turn.sequence}
                speaker={turn.speaker}
                author={proposal.mine ? 'You' : 'The author'}
              >
                {turn.speaker === 'conversation' ? <Written text={turn.text} /> : turn.text}
                {turn.screenshots.length > 0 && (
                  <div className="mt-3">
                    <Screenshots screenshots={turn.screenshots} />
                  </div>
                )}
              </Said>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}

/**
 * **What becomes of it**, an Administrator's to decide: Taken up from New, Done from Taken up,
 * and Declined from either with a reason its author will read. The next step along is the one
 * teal button; declining asks for its reason before it can be pressed.
 */
function Deciding({ proposal }: { proposal: Proposal }) {
  const decide = useDecide(proposal.id);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  if (proposal.status !== 'new' && proposal.status !== 'taken-up') {
    return null;
  }
  const next = proposal.status === 'new' ? 'taken-up' : 'done';

  function decline(event: FormEvent) {
    event.preventDefault();
    decide.mutate(
      { status: 'declined', reason: reason.trim() },
      { onSuccess: () => setDeclining(false) },
    );
  }

  return (
    <div className="mt-8 border-y border-line py-4" data-testid="deciding">
      {decide.isError && (
        <div className="mb-3">
          <Refusal>{refusalText(decide.error)}</Refusal>
        </div>
      )}
      {declining ? (
        <form onSubmit={decline} className="max-w-measure">
          <label htmlFor="decline-reason" className="text-sm font-semibold text-text">
            Why is it declined? Its author reads this.
          </label>
          <textarea
            id="decline-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className={cn(
              'mt-2 block w-full resize-none rounded-md border border-line-strong bg-surface',
              'px-3 py-2 text-base text-text',
            )}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="danger"
              disabled={decide.isPending || reason.trim() === ''}
            >
              Decline
            </Button>
            <Button variant="ghost" onClick={() => setDeclining(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ status: next })}
          >
            {next === 'taken-up' ? 'Take up' : 'Mark done'}
          </Button>
          <Button disabled={decide.isPending} onClick={() => setDeclining(true)}>
            Decline…
          </Button>
        </div>
      )}
    </div>
  );
}
