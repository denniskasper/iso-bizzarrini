import { Link, useRouterState } from '@tanstack/react-router';
import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { environmentMode } from '@/lib/environment';
import { useSession } from '@/lib/session';
import { useTour } from '@/lib/tour';
import { cn } from '@/lib/utils';

/**
 * **A guided tour of what is new, for a tester on the practice system.** Temporary: delete this
 * folder, `lib/tour.ts` and the one line in the app shell once it has been walked.
 *
 * It starts from a link ending in `?tour`, and never in production. It waits beside the page
 * rather than over it: each step says what to do on the screen as it is, and moves on by itself
 * once the screen shows it was done, so the tester is using Ricambi and not a slideshow of it.
 */

type Part = 'read' | 'show' | 'visit';

interface Where {
  path: string;
  signedIn: boolean;
  /** Whether who this is has been answered yet: signed out is not known until it has. */
  known: boolean;
}

interface Step {
  part: Part | null;
  title: string;
  body: ReactNode;
  /** Somewhere to go for this step, unless already there. */
  go?: { to: string; label: string; unless: (where: Where) => boolean };
  /** The screen showing this step was done. Without one, the tester says so. */
  done?: (where: Where) => boolean;
  /** What the tester presses to say they are done, where nothing can tell. */
  next?: string;
}

const onTavola = (where: Where) => where.path.startsWith('/tavole/');

const STEPS: Step[] = [
  {
    part: null,
    title: 'Three new things to try',
    body: (
      <>
        <p>This tour walks you through them on this practice archive, about fifteen minutes:</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>Read a Tavola from the factory catalogue, and check it.</li>
          <li>Choose a drawing that Visitors may see.</li>
          <li>See Ricambi as somebody who isn’t a member.</li>
        </ol>
        <p className="mt-3">Each step waits here until you’ve done it on the page.</p>
      </>
    ),
    next: 'Start',
  },
  {
    part: 'read',
    title: 'Start a reading',
    body: (
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Choose the PDF <b>Iso Rivolta Parts Catalogue Part2</b>.
        </li>
        <li>
          Model <b>Iso Rivolta IR 300</b>, from page <b className="tabular">1</b> to page{' '}
          <b className="tabular">2</b>.
        </li>
        <li>
          Press <b>Estimate the cost</b>, enter <b className="tabular">2</b> as the spending limit,
          then <b>Start reading</b>.
        </li>
      </ol>
    ),
    go: {
      to: '/readings',
      label: 'Go to Readings',
      unless: (where) => where.path === '/readings',
    },
    done: (where) => where.path.startsWith('/readings/runs/'),
  },
  {
    part: 'read',
    title: 'Wait for it to finish',
    body: (
      <p>
        Reading two pages takes a few minutes. You can leave this page; the reading carries on. When
        it says <b>Finished</b>, press <b>Open, Unchecked</b> beside Tavola{' '}
        <b className="tabular">51</b>.
      </p>
    ),
    done: onTavola,
  },
  {
    part: 'read',
    title: 'Check what was read',
    body: (
      <>
        <p>
          Press <b>How to check this Tavola</b>, then compare the circles on the drawing and the
          rows of Parts with the factory sheet. Point at any button to see what it does.
        </p>
        <p className="mt-3">
          Please don’t press <b>Publish</b>: this Tavola stays Unchecked for the next tester.
        </p>
      </>
    ),
    next: 'I’ve checked it',
  },
  {
    part: 'show',
    title: 'Show a drawing to Visitors',
    body: (
      <>
        <p>
          Visitors are people reading Ricambi without signing in. You may show them a few Published
          drawings, so they can judge the archive before they join.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>Open any Published Tavola from the catalogue.</li>
          <li>
            Below the drawing, under <b>Visitors</b>, press <b>Show to Visitors</b>.
          </li>
          <li>Click the one number on the drawing Visitors may read.</li>
        </ol>
      </>
    ),
    go: { to: '/', label: 'Go to the catalogue', unless: onTavola },
    next: 'It’s shown',
  },
  {
    part: 'visit',
    title: 'Sign out',
    body: (
      <p>
        Now see Ricambi as a Visitor does. Sign out with the button at the top; this tour carries
        on.
      </p>
    ),
    done: (where) => where.known && !where.signedIn,
  },
  {
    part: 'visit',
    title: 'What a Visitor sees',
    body: (
      <p>
        Without signing in, this is all of Ricambi: which cars the archive covers and how much of
        each, the drawings you chose, and how to join the Club. Open the drawing you just showed.
      </p>
    ),
    go: { to: '/', label: 'Go to the start page', unless: (where) => where.path === '/' },
    done: (where) => where.known && !where.signedIn && onTavola(where),
  },
  {
    part: 'visit',
    title: 'One number open',
    body: (
      <p>
        A Visitor reads only what the factory printed, and only at the number you opened: the others
        are locked. None of the Club’s notes, photographs or cross-references are shown. A member
        following the same link sees the whole Tavola.
      </p>
    ),
    next: 'Next',
  },
  {
    part: null,
    title: 'That’s all of it',
    body: (
      <p>
        Sign in again to carry on as before. Anything unclear, slow or wrong along the way: reply to
        the e-mail this tour came with.
      </p>
    ),
    go: {
      to: '/sign-in',
      label: 'Sign in',
      unless: (where) => where.signedIn || where.path === '/sign-in',
    },
    next: 'End the tour',
  },
];

const PARTS: { part: Part; name: string }[] = [
  { part: 'read', name: 'Read' },
  { part: 'show', name: 'Show' },
  { part: 'visit', name: 'Visit' },
];

export function GuidedTour() {
  const { state, start, end, goTo, fold } = useTour();
  const { signedIn, isPending } = useSession();
  const path = useRouterState({ select: (router) => router.location.pathname });

  // A link ending in `?tour` starts it from the beginning, and is then forgotten, so reloading
  // the page does not start it over.
  useEffect(() => {
    if (environmentMode() === 'production') {
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.has('tour')) {
      start();
      url.searchParams.delete('tour');
      window.history.replaceState(window.history.state, '', url);
    }
  }, [start]);

  const step = state ? STEPS[state.step] : undefined;
  const where: Where = { path, signedIn, known: !isPending };
  const finished = step?.done?.(where) ?? false;

  useEffect(() => {
    if (state && finished) {
      goTo(state.step + 1);
    }
  }, [state, finished, goTo]);

  if (environmentMode() === 'production' || !state || !step) {
    return null;
  }

  const last = state.step === STEPS.length - 1;
  const advance = () => (last ? end() : goTo(state.step + 1));
  const go = step.go && !step.go.unless(where) ? step.go : null;
  const reached = step.part ? PARTS.findIndex((part) => part.part === step.part) : -1;
  const partsDone = last ? PARTS.length : reached;

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
          {PARTS.map(({ part, name }, index) => (
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
        <div className="mt-2 text-sm text-pretty">{step.body}</div>

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
          {state.step > 0 && (
            <Button variant="ghost" className="px-3" onClick={start}>
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
 * **Taking the tour again**, from the footer of a practice system, for whoever ended it or wants
 * to walk it from the start. Nothing while it is running: the panel has its own way to start over.
 */
export function TourLink({ className }: { className: string }) {
  const { state, start } = useTour();
  if (environmentMode() === 'production' || state) {
    return null;
  }
  return (
    <button type="button" className={className} onClick={start}>
      Take the tour
    </button>
  );
}
