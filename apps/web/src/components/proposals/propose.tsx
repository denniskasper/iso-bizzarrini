import type { Proposal, ProposalContext, ProposalKind, ProposalSummary } from '@ricambi/contracts';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import { ApiError, refusalText } from '@/lib/api';
import {
  KIND_NAME,
  OPENING_QUESTION,
  useConverse,
  useDrafts,
  useOnScreen,
  useProposal,
  useStartProposal,
} from '@/lib/proposals';
import { cn } from '@/lib/utils';

/**
 * **Propose**, on every page of a practice system, for those an Administrator has let propose
 * (issue #152). The conversation opens beside the page it is about, so the page stays in view;
 * on a phone it takes the screen and gives the page back when it is closed. Closing keeps the
 * Draft, and the panel opens again on the Drafts to carry on.
 */
export function Propose({ className }: { className: string }) {
  const [open, setOpen] = useState(false);
  const [proposalId, setProposalId] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className={className}
        aria-expanded={open}
        data-testid="propose"
        onClick={() => setOpen((was) => !was)}
      >
        Propose
      </button>
      {open && (
        <ProposalPanel
          proposalId={proposalId}
          onOpen={setProposalId}
          onClose={() => {
            setOpen(false);
            setProposalId(null);
          }}
        />
      )}
    </>
  );
}

function ProposalPanel({
  proposalId,
  onOpen,
  onClose,
}: {
  proposalId: string | null;
  onOpen: (proposalId: string | null) => void;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [proposalId]);

  return (
    <aside
      aria-labelledby="propose-heading"
      data-testid="proposal-panel"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onClose();
        }
      }}
      className={cn(
        'fixed inset-0 z-30 flex flex-col bg-surface-raised',
        'sm:left-auto sm:w-proposal-panel sm:border-l sm:border-line sm:shadow-(--shadow-card)',
      )}
    >
      <header className="flex items-center gap-2 border-b border-line px-gutter py-2">
        <h2
          id="propose-heading"
          ref={heading}
          tabIndex={-1}
          className="display mr-auto text-3xl outline-none"
        >
          Propose
        </h2>
        {proposalId !== null && (
          <Button variant="link" className="px-2" onClick={() => onOpen(null)}>
            Your drafts
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </header>

      {proposalId === null ? (
        <Choosing onOpen={onOpen} />
      ) : (
        <Conversing key={proposalId} proposalId={proposalId} />
      )}
    </aside>
  );
}

/** Fix or Idea, chosen before anything is written — and the Drafts, to carry one on. */
function Choosing({ onOpen }: { onOpen: (proposalId: string) => void }) {
  const onScreen = useOnScreen();
  const start = useStartProposal();
  const drafts = useDrafts();

  function begin(kind: ProposalKind) {
    start.mutate({ kind, ...onScreen }, { onSuccess: ({ proposal }) => onOpen(proposal.id) });
  }

  return (
    <div className="flex-1 overflow-y-auto px-gutter py-6">
      <p className="text-base text-text">What do you bring?</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <KindChoice
          kind="fix"
          meaning="Something is wrong."
          disabled={start.isPending}
          onChoose={begin}
        />
        <KindChoice
          kind="idea"
          meaning="Something should be new."
          disabled={start.isPending}
          onChoose={begin}
        />
      </div>
      {start.isError && (
        <div className="mt-3">
          <Refusal>{refusalText(start.error)}</Refusal>
        </div>
      )}

      <h3 className="label mt-10">Your drafts</h3>
      {drafts.isPending ? (
        <p className="tag mt-2">Reading your drafts…</p>
      ) : drafts.isError ? (
        <div className="mt-2">
          <Refusal>{refusalText(drafts.error)}</Refusal>
        </div>
      ) : drafts.data.drafts.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          None yet. A conversation you leave is kept here to carry on.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line border-y border-line" data-testid="drafts">
          {drafts.data.drafts.map((draft) => (
            <li key={draft.id}>
              <DraftLink draft={draft} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KindChoice({
  kind,
  meaning,
  disabled,
  onChoose,
}: {
  kind: ProposalKind;
  meaning: string;
  disabled: boolean;
  onChoose: (kind: ProposalKind) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChoose(kind)}
      className={cn(
        'flex min-h-32 flex-col items-start justify-between rounded-lg border border-line-strong',
        'bg-surface px-4 py-3 text-left transition-colors duration-150',
        'ease-[var(--ease-out-quick)] hover:border-text hover:bg-surface-sunken',
        'disabled:opacity-40',
      )}
    >
      <span className="display text-5xl text-text">{KIND_NAME[kind]}</span>
      <span className="text-sm text-muted">{meaning}</span>
    </button>
  );
}

function DraftLink({
  draft,
  onOpen,
}: {
  draft: ProposalSummary;
  onOpen: (proposalId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(draft.id)}
      className="block w-full py-3 text-left hover:bg-surface-sunken"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-accent-ink">{KIND_NAME[draft.kind]}</span>
        <span className="tag tabular">{draft.updatedAt.slice(0, 10)}</span>
      </span>
      <span className="mt-1 line-clamp-2 block text-sm text-pretty text-text">
        {draft.opening ?? 'Nothing written yet.'}
      </span>
      <span className="tag mt-1 block truncate">{whereFrom(draft.context)}</span>
    </button>
  );
}

function Conversing({ proposalId }: { proposalId: string }) {
  const read = useProposal(proposalId);

  if (read.isPending) {
    return <p className="tag px-gutter py-6">Reading the conversation…</p>;
  }
  if (read.isError) {
    return (
      <div className="px-gutter py-6">
        <Refusal>{refusalText(read.error)}</Refusal>
      </div>
    );
  }
  return <Conversation proposal={read.data.proposal} />;
}

function Conversation({ proposal }: { proposal: Proposal }) {
  const converse = useConverse(proposal.id);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [proposal.turns.length, converse.answering]);

  function send(event?: FormEvent) {
    event?.preventDefault();
    const said = text.trim();
    if (said === '' || converse.isPending) {
      return;
    }
    converse.mutate(said, { onSuccess: () => setText('') });
  }

  function sendOnModifiedEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      send();
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <OnScreen kind={proposal.kind} context={proposal.context} />

        <ol className="space-y-5 px-gutter py-6" data-testid="conversation">
          <Said speaker="conversation">{OPENING_QUESTION[proposal.kind]}</Said>
          {proposal.turns.map((turn) => (
            <Said key={turn.sequence} speaker={turn.speaker}>
              {turn.text}
            </Said>
          ))}
          {converse.asked !== null && <Said speaker="author">{converse.asked}</Said>}
          {converse.answering !== null && (
            <Said speaker="conversation" live>
              {converse.answering === '' ? '…' : converse.answering}
            </Said>
          )}
        </ol>
        <div ref={end} />
      </div>

      <form onSubmit={send} className="border-t border-line px-gutter py-3">
        {converse.isError && (
          <div className="mb-2">
            <Refusal>
              {converse.error instanceof ApiError || !(converse.error instanceof Error)
                ? refusalText(converse.error)
                : converse.error.message}
            </Refusal>
          </div>
        )}
        <label htmlFor="proposal-turn" className="sr-only">
          Your answer
        </label>
        <textarea
          id="proposal-turn"
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={sendOnModifiedEnter}
          placeholder="Write in your own words, in German or English."
          className={cn(
            'block w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2',
            'text-base text-text placeholder:text-faint',
          )}
        />
        <div className="mt-2 flex justify-end">
          <Button
            type="submit"
            variant="primary"
            disabled={converse.isPending || text.trim() === ''}
          >
            {converse.isPending ? 'Answering…' : 'Send'}
          </Button>
        </div>
      </form>
    </>
  );
}

/** What the developer will see it came from, and the line that stays above every conversation. */
function OnScreen({ kind, context }: { kind: ProposalKind; context: ProposalContext }) {
  return (
    <section
      aria-label="Attached to this Proposal"
      className="border-b border-line bg-surface-sunken px-gutter py-4"
      data-testid="proposal-context"
    >
      <p className="text-sm font-semibold text-text">A {KIND_NAME[kind]}, from</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {context.tavola !== null && (
          <>
            <dt className="text-muted">Tavola</dt>
            <dd className="text-text">
              <span className="tabular">{context.tavola.number}</span> {context.tavola.name}
            </dd>
          </>
        )}
        {context.model !== null && (
          <>
            <dt className="text-muted">Model</dt>
            <dd className="text-text">{context.model.name}</dd>
          </>
        )}
        <dt className="text-muted">Page</dt>
        <dd className="tabular truncate text-text">{context.pageAddress}</dd>
        <dt className="text-muted">Version</dt>
        <dd className="tabular text-text">{context.version}</dd>
      </dl>
      <p className="mt-3 text-sm text-pretty text-muted" data-testid="no-names">
        Please do not name members. Say “a member” or what they do in the Club instead.
      </p>
    </section>
  );
}

function Said({
  speaker,
  live = false,
  children,
}: {
  speaker: 'author' | 'conversation';
  live?: boolean;
  children: string;
}) {
  return (
    <li
      data-speaker={speaker}
      aria-live={live ? 'polite' : undefined}
      className={cn(
        'text-base text-pretty whitespace-pre-wrap',
        speaker === 'author'
          ? 'ml-8 rounded-lg bg-surface-sunken px-3 py-2 text-text'
          : 'mr-4 text-text',
      )}
    >
      <span className="sr-only">{speaker === 'author' ? 'You: ' : 'Answer: '}</span>
      {children}
    </li>
  );
}

function whereFrom(context: ProposalContext): string {
  if (context.tavola !== null) {
    return `Tavola ${context.tavola.number}, ${context.model?.name ?? ''}`.replace(/, $/, '');
  }
  return context.model?.name ?? context.pageAddress;
}
