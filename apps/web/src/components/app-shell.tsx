import type { ReactNode } from 'react';
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
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-gutter py-2">
          <a
            href="/"
            className="-mx-2 flex h-control items-center rounded-sm px-2 text-text transition-opacity hover:opacity-70"
            aria-label="Ricambi — the Club's parts reference"
          >
            <Wordmark />
          </a>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-gutter py-16 sm:py-24">{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-6xl px-gutter py-6">
          <ServiceStatusStrip />
        </div>
      </footer>
    </div>
  );
}
