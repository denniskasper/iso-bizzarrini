import { Link } from '@tanstack/react-router';
import { useEffect, useRef, type ReactNode } from 'react';
import { EnvironmentBanner } from '@/components/environment-banner';
import { Propose } from '@/components/proposals/propose';
import { SessionControl } from '@/components/session-control';
import { ThemeToggle } from '@/components/theme-toggle';
import { GuidedTour, TourLink } from '@/components/tour/guided-tour';
import { Wordmark } from '@/components/wordmark';
import { ServiceStatusStrip } from '@/components/service-status-strip';
import { useWaitingCount } from '@/lib/review';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

/**
 * The chrome. It is a frame around a drawing, so it does two things and then gets out of the
 * way: it says where you are, and it gets you somewhere else.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { account, isAdministrator, isEditor, mayRead, signedIn } = useSession();
  const waiting = useWaitingCount();
  const chrome = useChromeHeight();

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      {/* The stamp travels with the chrome: a mark you can scroll away from is a mark you can
          forget. In production nothing is rendered above the header at all. */}
      <div ref={chrome} className="sticky top-0 z-10" data-chrome>
        <EnvironmentBanner />

        {/* The Club website's graphite, in either theme (ADR 0020): `chrome` gives the header the
            dark theme's values, so everything in it is measured against graphite. */}
        <header className="chrome border-b border-line bg-surface-raised">
          {/*
            **It wraps for an Administrator and not for anybody else**, which is a narrower rule
            than it looks and is load-bearing rather than tidy.

            A member's row fits a phone by shrinking, and has always done so. An Administrator's
            carries two more entries and is 136px wider than a 412px phone, and what a row that
            does not fit does is make the *whole page* scroll sideways — which puts the chrome
            over whatever was being clicked. It cost two mobile tests in specs that have nothing
            to do with the roster. Allowing the wrap unconditionally would fix that and take the
            member's single-line chrome away with it, on the screens where a drawing needs the
            height most, to solve a problem members do not have.
          */}
          <div
            className={cn(
              'mx-auto flex w-full max-w-6xl items-center justify-between gap-x-4 px-gutter py-2',
              // An Editor's row carries one more entry too, and is given the same room for it.
              (isAdministrator || isEditor) && 'flex-wrap',
            )}
          >
            <a
              href="/"
              className="-mx-2 flex h-control min-w-0 items-center rounded-sm px-2 text-text transition-opacity hover:opacity-70"
            >
              <Wordmark />
            </a>
            {/* Its links wrap too, for an Administrator, and for anybody who may propose: with
                Readings beside Roster and Club, or Proposals beside Propose, they are wider than
                a phone on their own, and a row wider than the phone zooms the whole page out —
                taking the Propose panel's Send button below the bottom of the screen. */}
            <div
              className={cn(
                'ml-auto flex items-center gap-1',
                // Anybody else's links keep their width, and the Club's wordmark gives way to them.
                isAdministrator || account?.mayPropose ? 'flex-wrap justify-end' : 'shrink-0',
              )}
            >
              {/*
                Searching is the one thing a member may want from *any* screen, because the
                bracket in their hand does not know which drawing is open — so it lives in the
                chrome. A link and not a field: a box across the top of a page whose subject is a
                factory drawing would be chrome competing with the artwork, which is the one
                thing this frame is not allowed to do.

                Offered only to somebody who may actually read the archive. A lapsed member is
                shown the renewal screen wherever they go, and a link that leads them back to the
                screen they are already on reads as a fault rather than as a refusal.
              */}
              {mayRead && (
                <Link to="/search" className={chromeLink}>
                  Search
                </Link>
              )}
              {/*
                **What members have sent, and how many of them are waiting** (issue #6). Here,
                on every screen, because a queue an Editor has to go and look at is a queue
                that is forgotten — and a member who wrote on Tuesday is owed somebody noticing.

                The number is part of the link's own name and not a badge beside it, so a screen
                reader says "Review, 3 waiting" as one thing. It wears no accent: it is a count,
                and the count being nought is the ordinary state of a well-kept archive, said by
                the number simply not being there.
              */}
              {isEditor && mayRead && (
                <Link to="/review" className={chromeLink} data-testid="review-link">
                  Review
                  {waiting > 0 && (
                    <span className="tabular ml-2 text-text" data-testid="waiting-count">
                      {waiting}
                      <span className="sr-only"> waiting</span>
                    </span>
                  )}
                </Link>
              )}
              {/*
                An Administrator's screens, and only an Administrator's. They are in the
                chrome rather than on a menu because keeping the roster is a job somebody sits
                down to do, and a screen you have to go looking for is a screen nobody goes to.
                The archive enforces the role; hiding them here is convenience, not the rule.
              */}
              {isAdministrator && (
                <>
                  <Link to="/roster" className={chromeLink}>
                    Roster
                  </Link>
                  <Link to="/club" className={chromeLink}>
                    Club
                  </Link>
                  <Link to="/readings" className={chromeLink}>
                    Readings
                  </Link>
                  <Link to="/spending" className={chromeLink} data-testid="spending-link">
                    Spending
                  </Link>
                </>
              )}
              {/* **Propose** (issue #152): on every page, for those an Administrator has let
                  propose, and only where the archive says there is a conversation to be had —
                  which is never Production. Plain like the links beside it: the accent is
                  each page's own one action, and this is a way out of it. */}
              {account?.mayPropose && (
                <>
                  <Link to="/proposals" className={chromeLink} data-testid="proposals-link">
                    Proposals
                  </Link>
                  <Propose className={chromeLink} />
                </>
              )}
              <SessionControl />
              <ThemeToggle />
            </div>
          </div>
        </header>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-gutter pt-10 pb-16 sm:pt-14 sm:pb-24">
        {children}
      </main>

      <footer className="chrome border-t border-line bg-surface-raised">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-gutter py-4">
          <ServiceStatusStrip />
          {/* On every screen, signed in or not: who is behind the platform and what it keeps
              about a person are not things anybody should have to be a member to find out. */}
          <nav aria-label="Legal" className="-mx-3 flex flex-wrap items-center gap-1">
            {/* A member's own Membership, on every screen and at every width (ADR 0004). */}
            {signedIn && (
              <Link to="/membership" className={chromeLink}>
                Membership
              </Link>
            )}
            <Link to="/legal-notice" className={chromeLink}>
              Legal notice
            </Link>
            <Link to="/privacy" className={chromeLink}>
              Privacy
            </Link>
            {/* Temporary, with the tour itself: practice systems only. */}
            <TourLink className={chromeLink} />
          </nav>
        </div>
      </footer>

      {/* Temporary: a tester's walk through what is new, on a practice system only. */}
      <GuidedTour />
    </div>
  );
}

/**
 * A way out of the chrome and into somewhere else: plain text at the full touch height, wearing
 * no accent. The accent on these screens means the one dominant action, and a row of navigation
 * claiming to be that would leave nothing on the page that still meant it.
 */
const chromeLink =
  'flex h-control items-center rounded-md px-3 text-sm text-muted transition-colors duration-150 ease-[var(--ease-out-quick)] hover:bg-surface-sunken hover:text-text';

/**
 * **How tall the chrome is, as `--chrome-height` on the page**, for whatever stays in view below
 * it as the page scrolls: a drawing beside its parts, a table sheet beside its rows. It is not one
 * figure: the banner of a practice system is above it, and an Administrator's row wraps.
 */
function useChromeHeight() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty('--chrome-height', `${element.offsetHeight}px`);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--chrome-height');
    };
  }, []);
  return ref;
}
