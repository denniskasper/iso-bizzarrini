import { cn } from '@/lib/utils';

/** The Club's registered name, which its wordmark spells out: what the logo says to a reader. */
const CLUB_NAME = 'ISO Bizzarrini Club Deutschland e.V.';

/**
 * **The Club's own wordmark, with "Ricambi" beside it** (issue #209, ADR 0020), so a member
 * recognises the archive as the Club's before reading a word. The logo is the one the Club
 * website shows in its header, white on transparent, committed under `public/club/` and served
 * by the app itself: every system shows it, and nothing is mounted at deploy time. It is white,
 * so it only ever sits on the graphite header.
 *
 * "Ricambi" is the product's name in small type until #158 decides it. On a phone it sits under
 * the logo, so the row keeps its height and its controls their touch size; wherever there is the
 * room it stands beside it, ruled apart. The logo is the one thing in the row that gives way: it
 * scales down, keeping its proportions, before the header would wrap.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-3',
        className,
      )}
    >
      <img
        src="/club/wordmark.png"
        srcSet="/club/wordmark.png 1x, /club/wordmark-retina.png 2x"
        alt={CLUB_NAME}
        width={232}
        height={54}
        className="h-6 w-auto max-w-full min-w-0 object-contain object-left sm:h-9"
        data-testid="club-wordmark"
      />
      <span className="text-xs leading-none text-muted sm:border-l sm:border-line sm:py-1 sm:pl-3 sm:text-sm">
        Ricambi
      </span>
    </span>
  );
}

/**
 * The Club's emblem is a thin-ruled circle quartered by a diagonal cross. Reduced here to its
 * geometry — which doubles as the registration mark a printer aligns a plate with, and every
 * drawing in this archive was printed once. It stays on the favicon and on empty states; the header
 * wears the Club's own wordmark.
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
