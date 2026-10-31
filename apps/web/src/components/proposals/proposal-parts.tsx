import type { ProposalContext, ProposalSpeaker, ProposalSummary } from '@ricambi/contracts';
import type { ReactNode } from 'react';
import { AUDIENCE_NAME } from '@/lib/proposals';
import { cn } from '@/lib/utils';

/**
 * **The finished Proposal** (issue #153), in the fixed shape for its kind: what the developer
 * reads and turns into an issue. The author's own words come last and verbatim, set apart from
 * the summary's, so nobody mistakes the one for the other.
 */
export function FinishedProposal({ summary }: { summary: ProposalSummary }) {
  return (
    <div data-testid="finished-proposal">
      <h3 className="display text-3xl text-pretty">{summary.title}</h3>
      <dl className="mt-4 space-y-4 text-base">
        {summary.kind === 'fix' ? (
          <>
            <Part name="What happened">{summary.whatHappened}</Part>
            <Part name="What was expected">{summary.whatWasExpected}</Part>
            <Part name="Steps to make it happen">
              <Listed items={summary.steps} ordered empty="Not known." />
            </Part>
            <Part name="Where">{summary.where}</Part>
          </>
        ) : (
          <>
            <Part name="The problem">{summary.problem}</Part>
            <Part name="Who it is for">
              {summary.forWhom.length === 0
                ? 'Not decided.'
                : summary.forWhom.map((audience) => AUDIENCE_NAME[audience]).join(', ')}
            </Part>
            <Part name="What it should do">{summary.whatItShouldDo}</Part>
            <Part name="Decisions made">
              <Listed items={summary.decisions} empty="None yet." />
            </Part>
            <Part name="Open questions">
              <Listed items={summary.openQuestions} empty="None." />
            </Part>
            <Part name="New terms">
              <Listed
                items={summary.newTerms.map(({ term, meaning }) => `${term}: ${meaning}`)}
                empty="None."
              />
            </Part>
          </>
        )}
        <Part name="In the author’s words">
          <ul className="space-y-2">
            {summary.authorsWords.map((words, index) => (
              <li
                key={index}
                className="border-l-2 border-line-strong pl-3 text-pretty whitespace-pre-wrap"
              >
                {words}
              </li>
            ))}
          </ul>
        </Part>
      </dl>
      <p className="tag mt-4">Written by {summary.model}</p>
    </div>
  );
}

function Part({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-muted">{name}</dt>
      <dd className="mt-1 text-pretty text-text">{children}</dd>
    </div>
  );
}

function Listed({
  items,
  ordered = false,
  empty,
}: {
  items: string[];
  ordered?: boolean;
  empty: string;
}) {
  if (items.length === 0) {
    return <span className="text-muted">{empty}</span>;
  }
  const List = ordered ? 'ol' : 'ul';
  return (
    <List className={cn('space-y-1 pl-5', ordered ? 'list-decimal' : 'list-disc')}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </List>
  );
}

/** What a Proposal was started from: the Tavola and Model on screen, the page and the Version. */
export function ContextList({ context }: { context: ProposalContext }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
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
  );
}

/** One turn of the conversation: the author's set in, the answer's against the margin. */
export function Said({
  speaker,
  live = false,
  author = 'You',
  children,
}: {
  speaker: ProposalSpeaker;
  live?: boolean;
  /** Who the author is to whoever is reading. */
  author?: string;
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
      <span className="sr-only">{speaker === 'author' ? `${author}: ` : 'Answer: '}</span>
      {children}
    </li>
  );
}
