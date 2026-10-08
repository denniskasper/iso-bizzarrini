import { cn } from '@/lib/utils';

/**
 * The wordmark, set the way the Club sets its own: a roundel beside a tall, light, condensed
 * capital in the display face. The Club's lockup is drawn this way, so
 * the archive and the Club site read as one organisation without the archive borrowing the
 * Club's German name — this is the English property.
 *
 * The Club's own logo file is deliberately **not** committed here. It carries the association's
 * name, and this repository does not hold client-identifying assets (`AGENTS.md`, Security);
 * it is dropped in at deploy time. The treatment, which is what makes the two look alike, is
 * all in this component and in the type and colour tokens.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <Roundel className="size-6" />
      <span className="display text-2xl leading-none tracking-wordmark">Ricambi</span>
    </span>
  );
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
