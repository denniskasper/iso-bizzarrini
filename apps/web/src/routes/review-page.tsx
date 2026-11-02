import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Reviewing } from '@/components/review/reviewing';
import { Refusal } from '@/components/ui/field';
import type { WaitingContribution } from '@/lib/api';
import { authorOf, writtenOn } from '@/lib/contributions';
import { useWaitingContributions } from '@/lib/review';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

/**
 * What members have sent, and an Editor working through it (stories 115–120).
 *
 * **One at a time, and the oldest first.** The queue is not a wall of cards to pick the easy
 * ones from: the Contribution that has waited longest is the one on the screen, beside the
 * record it is about, and deciding it brings up the next. That is "nobody's is forgotten" made
 * into the shape of the page rather than left to an Editor's conscience — and it is why there is
 * one teal button here and not one a Contribution.
 *
 * Everything else still waiting is listed underneath, in order, with its place in the line. An
 * Editor may open one out of turn, because a photograph of a part on somebody's bench is
 * sometimes the answer to the question above it; what they cannot do is lose sight of how many
 * are ahead of it.
 */
export function ReviewPage() {
  const { isEditor } = useSession();
  const { data, isPending, isError, error } = useWaitingContributions();
  /** One opened out of turn. Forgotten the moment it is decided, which falls back to the oldest. */
  const [opened, setOpened] = useState<string | null>(null);

  const queue = data?.contributions ?? [];
  const reviewing = queue.find((waiting) => waiting.contribution.id === opened) ?? queue[0] ?? null;

  return (
    <div className="animate-rise">
      <p className="text-lg text-muted">
        <Link to="/" className="-my-2 inline-flex min-h-control items-center hover:text-text">
          The archive
        </Link>
      </p>
      <h1 className="display mt-4 text-4xl tracking-display sm:text-5xl">Waiting to be checked</h1>

      {!isEditor ? (
        <p className="mt-6 max-w-measure text-lg text-pretty text-muted">
          Checking what members have sent is an Editor’s job. What you have sent yourself is under
          the part or the position you wrote about.
        </p>
      ) : (
        <>
          {isPending && (
            <p className="mt-6 text-lg text-muted" role="status">
              Reading what members have sent…
            </p>
          )}
          {isError && (
            <div className="mt-6">
              <Refusal>{error.message}</Refusal>
            </div>
          )}

          {data && (
            <p
              className="mt-6 max-w-measure text-lg text-pretty text-muted"
              data-testid="queue-summary"
            >
              {summary(queue.length)}
            </p>
          )}

          {data && queue.length === 0 && (
            <div className="registration-mark mt-12 border border-line px-8 py-16 text-center sm:py-24">
              <p className="text-xl">Nothing is waiting.</p>
              <p className="mx-auto mt-3 max-w-measure text-pretty text-muted">
                Everything members have sent has been decided. The number beside Review in the
                header says when that changes.
              </p>
            </div>
          )}

          {reviewing && (
            <div className="mt-12 border-t border-line-strong pt-10">
              {/* Keyed, so a form half filled in for one Contribution is not the next one's. */}
              <Reviewing key={reviewing.contribution.id} waiting={reviewing} />
            </div>
          )}

          {queue.length > 1 && reviewing && (
            <section aria-labelledby="in-line" className="mt-16">
              <h2 id="in-line" className="label">
                All {queue.length} waiting, oldest first
              </h2>
              <ol className="mt-4 border-b border-line" data-testid="queue">
                {queue.map((waiting, index) => (
                  <li key={waiting.contribution.id}>
                    <button
                      type="button"
                      className={cn(
                        'sheet-line',
                        waiting === reviewing && 'bg-surface-sunken font-semibold',
                      )}
                      aria-current={waiting === reviewing ? 'true' : undefined}
                      data-testid="queue-line"
                      onClick={() => {
                        setOpened(waiting.contribution.id);
                        window.scrollTo({ top: 0 });
                      }}
                    >
                      <span className="tabular pl-2 text-muted">{index + 1}</span>
                      <span>
                        {authorOf(waiting.contribution)}
                        <span className="ml-3 font-normal text-faint">
                          {writtenOn(waiting.contribution.writtenAt)}
                        </span>
                        <span className="block text-sm font-normal text-pretty text-muted">
                          {about(waiting)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function summary(waiting: number): string {
  if (waiting === 0) {
    return 'What members send is read here by an Editor before anybody else sees it.';
  }
  return waiting === 1
    ? 'One Contribution from a member, read here before anybody else sees it.'
    : `${waiting} Contributions from members, the one that has waited longest first.`;
}

/** What a waiting Contribution is about, in the line it has in the queue. */
function about({ contribution, subject }: WaitingContribution): string {
  if (subject.kind === 'position') {
    return `About position ${subject.position.number} on Tavola ${subject.tavola.number}, ${subject.tavola.model.brand} ${subject.tavola.model.name}`;
  }
  const name = subject.part.nameEn ?? subject.part.nameIt ?? 'a part';
  return contribution.correction ? `Says the record of ${name} is wrong` : `About ${name}`;
}
