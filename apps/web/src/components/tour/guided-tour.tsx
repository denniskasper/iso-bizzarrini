import { Link, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/session';
import { useTour } from '@/lib/tour';
import { cn } from '@/lib/utils';
import type { Where } from './tour-steps';
import { FOOTER_TOURS, tourNamed, tourOrNone } from './tours';

/**
 * **A guided tour of what is new, for a tester on a practice system.** Never in production:
 * `index.tsx` does not even load this module there.
 *
 * The tours themselves are in `tours/`, one file each; this walks any of them. It waits beside
 * the page rather than over it: each step says what to do on the screen as it is, and moves on by
 * itself once the screen shows it was done, so the tester is using Ricambi and not a slideshow of
 * it.
 */

export function GuidedTour() {
  const { state, start, end, goTo, fold } = useTour();
  const { signedIn, isPending, account, isEditor, isAdministrator } = useSession();
  const path = useRouterState({ select: (router) => router.location.pathname });

  // A link ending in `?tour` starts it from the beginning, and is then forgotten, so reloading
  // the page does not start it over.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('tour')) {
      start(tourNamed(url.searchParams.get('tour')));
      url.searchParams.delete('tour');
      window.history.replaceState(window.history.state, '', url);
    }
  }, [start]);

  const tour = state ? tourOrNone(state.tour) : undefined;
  const step = state ? tour?.steps[state.step] : undefined;
  const where: Where = {
    path,
    signedIn,
    known: !isPending,
    mayPropose: account?.mayPropose ?? false,
    isEditor,
    isAdministrator,
  };
  const finished = step?.done?.(where) ?? false;

  // A tour retired since this browser began it is forgotten, so the footer offers the others.
  const retired = state !== null && tour === undefined;
  useEffect(() => {
    if (retired) {
      end();
    }
  }, [retired, end]);

  useEffect(() => {
    if (state && finished) {
      goTo(state.step + 1);
    }
  }, [state, finished, goTo]);

  if (!state || !tour || !step) {
    return null;
  }
  const { steps, parts } = tour;

  const last = state.step === steps.length - 1;
  const advance = () => (last ? end() : goTo(state.step + 1));
  const nextPart = steps.findIndex(
    (later, index) => index > state.step && later.part !== null && later.part !== step.part,
  );
  const go = step.go && !step.go.unless(where) ? step.go : null;
  const reached = step.part ? parts.findIndex((part) => part.part === step.part) : -1;
  const partsDone = last ? parts.length : reached;

  if (state.folded) {
    return (
      <aside aria-label="Guided tour" className="tour tour-folded" data-testid="tour">
        <button
          type="button"
          className="flex h-control w-full items-center gap-3 pr-4 pl-4 text-left text-sm"
          onClick={() => fold(false)}
          aria-expanded="false"
        >
          <span className="font-semibold">Tour</span>
          <span className="min-w-0 flex-1 truncate text-muted">{step.title}</span>
          <span className="text-accent-ink">Show</span>
        </button>
      </aside>
    );
  }

  return (
    <aside aria-label="Guided tour" className="tour" data-testid="tour">
      <div className="flex items-start justify-between gap-4 pt-4 pl-5">
        <ol className="flex flex-1 gap-1.5" aria-label="Parts of the tour">
          {parts.map(({ part, name }, index) => (
            <li
              key={part}
              className="flex-1"
              aria-current={part === step.part ? 'step' : undefined}
            >
              <span
                className={cn(
                  'block h-1 rounded-full',
                  index < partsDone || part === step.part ? 'bg-mark' : 'bg-line',
                )}
              />
              <span
                className={cn(
                  'mt-1.5 block text-xs',
                  part === step.part ? 'font-semibold text-text' : 'text-faint',
                )}
              >
                {name}
              </span>
            </li>
          ))}
        </ol>
        <Button
          variant="ghost"
          size="md"
          className="-mt-3 shrink-0 px-4"
          onClick={() => fold(true)}
          aria-expanded="true"
        >
          Fold
        </Button>
      </div>

      <div className="px-5 pt-3 pb-5" aria-live="polite">
        <h2 className="display text-3xl" data-testid="tour-step">
          {step.title}
        </h2>
        <div className="mt-2 text-sm text-pretty">
          {typeof step.body === 'function' ? step.body(where) : step.body}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {go ? (
            <Button asChild variant={step.next ? 'outline' : 'primary'}>
              <Link to={go.to}>{go.label}</Link>
            </Button>
          ) : null}
          {step.next ? (
            <Button variant="primary" onClick={advance}>
              {step.next}
            </Button>
          ) : (
            !go && <p className="text-sm text-muted">Waiting for you to do this on the page.</p>
          )}
        </div>

        {/* Quieter than the step's own action, on a line of their own. */}
        <div className="mt-2 -mr-3 flex flex-wrap justify-end gap-1">
          {step.skip && nextPart !== -1 && (
            <Button variant="ghost" className="px-3" onClick={() => goTo(nextPart)}>
              {step.skip}
            </Button>
          )}
          {state.step > 0 && (
            <Button variant="ghost" className="px-3" onClick={() => start(state.tour)}>
              Start over
            </Button>
          )}
          {!last && (
            <Button variant="ghost" className="px-3" onClick={end}>
              {state.step === 0 ? 'Not now' : 'End tour'}
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}

/**
 * **Taking a tour**, from the footer of a practice system, for whoever ended one, wants to walk
 * it from the start, or has not walked an earlier one yet. Nothing while one is running: the
 * panel has its own way to start over.
 */
export function TourLink({ className }: { className: string }) {
  const { state, start } = useTour();
  if (state) {
    return null;
  }
  return (
    <>
      {FOOTER_TOURS.map(({ name, footer }) => (
        <button key={name} type="button" className={className} onClick={() => start(name)}>
          {footer}
        </button>
      ))}
    </>
  );
}
