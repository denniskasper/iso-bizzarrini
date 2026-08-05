import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { EnvironmentBanner } from '@/components/environment-banner';
import { SessionControl } from '@/components/session-control';
import { ThemeToggle } from '@/components/theme-toggle';
import { Wordmark } from '@/components/wordmark';
import { ServiceStatusStrip } from '@/components/service-status-strip';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

/**
 * The chrome. It is a frame around a drawing, so it does two things and then gets out of the
 * way: it says where you are, and it gets you somewhere else.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { isAdministrator, mayRead } = useSession();

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      {/* The stamp travels with the chrome: a mark you can scroll away from is a mark you can
          forget. In production nothing is rendered above the header at all. */}
      <div className="sticky top-0 z-10">
        <EnvironmentBanner />

        {/* `surface-raised` is the Club's own chrome colour, measured from its site — so the
            band across the top of the archive is the band across the top of the Club's. */}
        <header className="border-b border-line bg-surface-raised">
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
              isAdministrator && 'flex-wrap',
            )}
          >
            <a
              href="/"
              className="-mx-2 flex h-control items-center rounded-sm px-2 text-text transition-opacity hover:opacity-70"
              aria-label="Ricambi — the Club's parts reference"
            >
              <Wordmark />
            </a>
            <div className="ml-auto flex items-center gap-1">
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
                An Administrator's two screens, and only an Administrator's. They are in the
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
                </>
              )}
              <SessionControl />
              <ThemeToggle />
            </div>
          </div>
        </header>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-gutter py-16 sm:py-24">{children}</main>

      <footer className="border-t border-line bg-surface-raised">
        <div className="mx-auto w-full max-w-6xl px-gutter py-6">
          <ServiceStatusStrip />
        </div>
      </footer>
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
