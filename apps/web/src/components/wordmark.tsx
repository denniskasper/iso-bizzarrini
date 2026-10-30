import { cn } from '@/lib/utils';

/**
 * The wordmark, set the way the Club sets its own: a roundel beside a tall, light, condensed
 * capital in the display face. The Club's lockup is drawn this way, so
 * the archive and the Club site read as one organisation without the archive borrowing the
 * Club's German name — this is the English property.
 *
 * **It names the Club, with "Parts Database" beside it** (issue #107), so a member knows whose
 * archive this is and what it holds. The name is the Club's own record — the registered name the
 * Legal notice prints — and is never written here; while that is blank it says "Ricambi". The
 * name is the one thing in the row allowed to give way: it shortens before the header would wrap
 * on a phone, and "Parts Database" stays whole beside it. `undefined` is "not known yet", which
 * holds the line's height and says nothing, rather than flashing "Ricambi" at every Club.
 *
 * The Club's own logo file is deliberately **not** committed here. It carries the association's
 * name, and this repository does not hold client-identifying assets (`AGENTS.md`, Security);
 * it is dropped in at deploy time. Until it is, the Roundel stands in for it.
 */
export function Wordmark({
  clubName,
  className,
}: {
  clubName: string | null | undefined;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2 sm:gap-3', className)}>
      <Roundel className="size-6 shrink-0" />
      {clubName ? (
        // Stacked on a phone, where a member's row has about ninety pixels for it once Search,
        // Sign out and the theme are in; side by side, ruled apart, wherever there is the room.
        <span className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-3">
          <span
            className="display min-w-0 truncate text-lg leading-none tracking-wordmark sm:text-2xl"
            data-testid="club-name"
          >
            {clubName}
          </span>
          <span className="min-w-0 truncate text-xs text-muted sm:shrink-0 sm:overflow-visible sm:border-l sm:border-line sm:pl-3 sm:text-sm">
            Parts Database
          </span>
        </span>
      ) : (
        <span
          className={cn(
            'display text-2xl leading-none tracking-wordmark',
            clubName === undefined && 'invisible',
          )}
        >
          Ricambi
        </span>
      )}
    </span>
  );
}

/** What the home link is called, which is what the wordmark shows. */
export function wordmarkName(clubName: string | null | undefined): string {
  return clubName ? `${clubName} Parts Database` : 'Ricambi';
}

/**
 * The Club's emblem is a thin-ruled circle quartered by a diagonal cross. Reduced here to its
 * geometry — which doubles as the registration mark a printer aligns a plate with, and every
 * drawing in this archive was printed once.
 */
export function Roundel({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <circle cx="12" cy="12" r="10.4" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M4.65 4.65 19.35 19.35M19.35 4.65 4.65 19.35"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="square"
      />
    </svg>
  );
}
