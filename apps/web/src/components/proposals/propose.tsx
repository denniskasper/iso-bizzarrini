import type {
  Proposal,
  ProposalContext,
  ProposalKind,
  ProposalListing,
  ProposalScreenshot,
} from '@ricambi/contracts';
import { Link } from '@tanstack/react-router';
import { Images } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  ContextList,
  FinishedProposal,
  Said,
  Screenshots,
  Shown,
} from '@/components/proposals/proposal-parts';
import { Button, buttonVariants } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import { ApiError, refusalText } from '@/lib/api';
import {
  KIND_NAME,
  OPENING_QUESTION,
  STATUS_NAME,
  useConverse,
  useDiscard,
  useDrafts,
  useHandOver,
  useOnScreen,
  useProposal,
  useScreenshots,
  useStartProposal,
  useSummarise,
} from '@/lib/proposals';
import { cn } from '@/lib/utils';
import { Written } from '@/components/proposals/written';

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
        <Conversing key={proposalId} proposalId={proposalId} onDiscarded={() => onOpen(null)} />
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
  draft: ProposalListing;
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

function Conversing({ proposalId, onDiscarded }: { proposalId: string; onDiscarded: () => void }) {
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
  return <Conversation proposal={read.data.proposal} onDiscarded={onDiscarded} />;
}

/**
 * The conversation, and **the finished Proposal** at the end of it (issue #153). Before it is
 * asked for, what is written carries the conversation on; once it is shown, what is written asks
 * for it to say something differently, and Hand over is the one thing left to press.
 */
function Conversation({ proposal, onDiscarded }: { proposal: Proposal; onDiscarded: () => void }) {
  const converse = useConverse(proposal.id);
  const summarise = useSummarise(proposal.id);
  const handOver = useHandOver(proposal.id);
  const screenshots = useScreenshots(proposal.id);
  const [text, setText] = useState('');
  /** What the author says about each waiting screenshot, by its id, until the turn is sent. */
  const [notes, setNotes] = useState<Record<string, string>>({});
  const end = useRef<HTMLDivElement>(null);
  const pickerId = useId();

  const isDraft = proposal.status === 'draft';
  const finished = proposal.summary;
  const busy =
    converse.isPending ||
    summarise.isPending ||
    handOver.isPending ||
    screenshots.show.isPending ||
    screenshots.remove.isPending;
  const hasSaidSomething = proposal.turns.some((turn) => turn.speaker === 'author');

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [proposal.turns.length, converse.answering, finished, summarise.isPending]);

  function send(event?: FormEvent) {
    event?.preventDefault();
    const said = text.trim();
    if (said === '' || busy) {
      return;
    }
    // Sent, the words leave the field at once: they are shown in the conversation above, and
    // left in the field they read as not sent. If sending fails, they come back to be sent again.
    setText('');
    const keep = () => setText((current) => (current === '' ? said : current));
    // A screenshot shown after the Proposal was finished carries the conversation on with it.
    if (finished === null || proposal.unsent.length > 0) {
      converse.mutate(
        {
          text: said,
          screenshots: proposal.unsent.map((shot) => ({
            id: shot.id,
            note: notes[shot.id]?.trim() || null,
          })),
        },
        {
          onSuccess: () => setNotes({}),
          onError: keep,
        },
      );
    } else {
      summarise.mutate(said, { onError: keep });
    }
  }

  function sendOnModifiedEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      send();
    }
  }

  function show(files: FileList | File[] | null) {
    const pictures = [...(files ?? [])].filter((file) => file.type.startsWith('image/'));
    if (pictures.length > 0) {
      screenshots.show.mutate(pictures);
    }
  }

  /** A screenshot pasted anywhere in the panel's form goes up; pasted text stays text. */
  function showPasted(event: ClipboardEvent) {
    const files = [...event.clipboardData.files].filter((file) => file.type.startsWith('image/'));
    if (files.length > 0) {
      event.preventDefault();
      show(files);
    }
  }

  const failure = [converse, summarise, handOver, screenshots.show, screenshots.remove].find(
    (mutation) => mutation.isError,
  )?.error;

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <OnScreen kind={proposal.kind} context={proposal.context} />

        <ol className="space-y-5 px-gutter py-6" data-testid="conversation">
          <Said speaker="conversation">{OPENING_QUESTION[proposal.kind]}</Said>
          {proposal.turns.map((turn) => (
            <Said key={turn.sequence} speaker={turn.speaker}>
              {turn.speaker === 'conversation' ? <Written text={turn.text} /> : turn.text}
              {turn.screenshots.length > 0 && (
                <div className="mt-3" data-testid="turn-screenshots">
                  <Screenshots
                    screenshots={turn.screenshots}
                    disabled={busy}
                    onRemove={isDraft ? (id) => screenshots.remove.mutate(id) : undefined}
                  />
                </div>
              )}
            </Said>
          ))}
          {converse.asked !== null && <Said speaker="author">{converse.asked}</Said>}
          {converse.answering !== null && (
            <Said speaker="conversation" live>
              {converse.answering === '' ? '…' : <Written text={converse.answering} />}
            </Said>
          )}
          {summarise.isPending && (
            <li className="tag" role="status">
              Writing the finished Proposal…
            </li>
          )}
        </ol>

        {finished !== null && !summarise.isPending && (
          <section
            aria-label="The finished Proposal"
            className="mx-gutter mb-6 rounded-lg border border-line-strong bg-surface px-4 py-5"
          >
            <FinishedProposal
              summary={finished}
              screenshots={proposal.turns.flatMap((turn) => turn.screenshots)}
            />
          </section>
        )}
        <div ref={end} />
      </div>

      {isDraft ? (
        <form
          onSubmit={send}
          onPaste={showPasted}
          className="max-h-3/5 overflow-y-auto border-t border-line px-gutter py-3"
        >
          {failure !== undefined && (
            <div className="mb-2">
              <Refusal>
                {failure instanceof ApiError || !(failure instanceof Error)
                  ? refusalText(failure)
                  : failure.message}
              </Refusal>
            </div>
          )}
          {proposal.unsent.length > 0 && (
            <ul className="mb-3 space-y-3" data-testid="unsent-screenshots">
              {proposal.unsent.map((shot, index) => (
                <li key={shot.id}>
                  <Waiting
                    screenshot={shot}
                    index={index}
                    note={notes[shot.id] ?? ''}
                    onNote={(note) => setNotes((was) => ({ ...was, [shot.id]: note }))}
                    disabled={busy}
                    onRemove={() => screenshots.remove.mutate(shot.id)}
                  />
                </li>
              ))}
            </ul>
          )}

          <label htmlFor="proposal-turn" className="sr-only">
            {finished === null ? 'Your answer' : 'Ask for a change'}
          </label>
          <textarea
            id="proposal-turn"
            rows={finished === null ? 3 : 2}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={sendOnModifiedEnter}
            placeholder={
              finished === null
                ? 'Write in your own words, in German or English. Paste a screenshot to show it.'
                : 'Should it say something differently? Write what to change.'
            }
            className={cn(
              'block w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2',
              'text-base text-text placeholder:text-faint',
            )}
          />
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <Discard proposalId={proposal.id} disabled={busy} onDiscarded={onDiscarded} />
            {/* A label rather than a scripted button, so a phone opens its own photo picker. */}
            <label
              htmlFor={pickerId}
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'cursor-pointer aria-disabled:pointer-events-none aria-disabled:opacity-40',
              )}
              aria-disabled={busy}
            >
              <Images aria-hidden="true" />
              {screenshots.show.isPending ? 'Adding…' : 'Add screenshots'}
            </label>
            <input
              id={pickerId}
              type="file"
              // A hint to the operating system and nothing more. What a file is is decided by
              // reading it, at the API.
              accept="image/*"
              multiple
              className="sr-only"
              disabled={busy}
              data-testid="proposal-screenshot-picker"
              onChange={(event) => {
                show(event.target.files);
                event.target.value = '';
              }}
            />
            {finished === null || proposal.unsent.length > 0 ? (
              <>
                <Button disabled={busy || !hasSaidSomething} onClick={() => summarise.mutate(null)}>
                  Finish
                </Button>
                <Button type="submit" variant="primary" disabled={busy || text.trim() === ''}>
                  {converse.isPending ? 'Answering…' : 'Send'}
                </Button>
              </>
            ) : (
              <>
                <Button type="submit" disabled={busy || text.trim() === ''}>
                  {summarise.isPending ? 'Writing…' : 'Change it'}
                </Button>
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => handOver.mutate(undefined)}
                >
                  {handOver.isPending ? 'Handing over…' : 'Hand over'}
                </Button>
              </>
            )}
          </div>
        </form>
      ) : (
        <div className="border-t border-line px-gutter py-4" data-testid="handed-over">
          <p className="text-base text-text">
            Handed over. It is {STATUS_NAME[proposal.status]}, and the developer will read it.
          </p>
          <Link
            to="/proposals/$proposalId"
            params={{ proposalId: proposal.id }}
            className="mt-1 inline-flex min-h-control items-center text-sm text-accent-ink underline-offset-4 hover:underline"
          >
            Follow it on Proposals
          </Link>
        </div>
      )}
    </>
  );
}

/**
 * **Discarding a Draft**, in two presses: a false start should not linger, and a conversation
 * somebody meant to keep should not vanish to a slip of the thumb.
 */
function Discard({
  proposalId,
  disabled,
  onDiscarded,
}: {
  proposalId: string;
  disabled: boolean;
  onDiscarded: () => void;
}) {
  const discard = useDiscard(proposalId);
  const [sure, setSure] = useState(false);

  if (!sure) {
    return (
      <Button variant="ghost" className="mr-auto" disabled={disabled} onClick={() => setSure(true)}>
        Discard
      </Button>
    );
  }
  return (
    <span className="mr-auto flex items-center gap-2">
      <Button
        variant="danger"
        disabled={disabled || discard.isPending}
        onClick={() => discard.mutate(undefined, { onSuccess: onDiscarded })}
      >
        Discard this draft
      </Button>
      <Button variant="ghost" onClick={() => setSure(false)}>
        Keep it
      </Button>
    </span>
  );
}

/**
 * A screenshot waiting to be sent, with a field for what in it matters. The note goes with the
 * turn, and is kept as written.
 */
function Waiting({
  screenshot,
  index,
  note,
  onNote,
  disabled,
  onRemove,
}: {
  screenshot: ProposalScreenshot;
  index: number;
  note: string;
  onNote: (note: string) => void;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <Shown
      screenshot={screenshot}
      label={`Screenshot ${index + 1} to send`}
      disabled={disabled}
      onRemove={onRemove}
    >
      <label htmlFor={`note-${screenshot.id}`} className="sr-only">
        Note on screenshot {index + 1}
      </label>
      <input
        id={`note-${screenshot.id}`}
        type="text"
        value={note}
        maxLength={2000}
        disabled={disabled}
        onChange={(event) => onNote(event.target.value)}
        placeholder="What in it matters? (optional)"
        className={cn(
          'block h-control w-full rounded-md border border-line-strong bg-surface',
          'px-3 text-sm text-text placeholder:text-faint',
        )}
      />
    </Shown>
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
      <div className="mt-2">
        <ContextList context={context} />
      </div>
      <p className="mt-3 text-sm text-pretty text-muted" data-testid="no-names">
        Please do not name members. Say “a member” or what they do in the Club instead.
      </p>
    </section>
  );
}

function whereFrom(context: ProposalContext): string {
  if (context.tavola !== null) {
    return `Tavola ${context.tavola.number}, ${context.model?.name ?? ''}`.replace(/, $/, '');
  }
  return context.model?.name ?? context.pageAddress;
}
