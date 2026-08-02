import type { ReactNode } from 'react';
import { EnvironmentBanner } from '@/components/environment-banner';
import { SessionControl } from '@/components/session-control';
import { ThemeToggle } from '@/components/theme-toggle';
import { Wordmark } from '@/components/wordmark';
import { ServiceStatusStrip } from '@/components/service-status-strip';

/**
 * The chrome. It is a frame around a drawing, so it does two things and then gets out of the
 * way: it says where you are, and it gets you somewhere else.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      {/* The stamp travels with the chrome: a mark you can scroll away from is a mark you can
          forget. In production nothing is rendered above the header at all. */}
      <div className="sticky top-0 z-10">
        <EnvironmentBanner />

        {/* `surface-raised` is the Club's own chrome colour, measured from its site — so the
            band across the top of the archive is the band across the top of the Club's. */}
        <header className="border-b border-line bg-surface-raised">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-gutter py-2">
            <a
              href="/"
              className="-mx-2 flex h-control items-center rounded-sm px-2 text-text transition-opacity hover:opacity-70"
              aria-label="Ricambi — the Club's parts reference"
            >
              <Wordmark />
            </a>
            <div className="flex items-center gap-1">
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
