import { cn } from '@/lib/utils';

/**
 * A provisional wordmark.
 *
 * The Club's own logo, colour and typography are to be lifted from the live Club site so the
 * two properties read as one organisation; until they have been captured, this stands in. It
 * is deliberately typographic and token-driven, so replacing it is one component and no
 * feature code.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-2.5', className)}>
      <RegistrationGlyph className="size-4 translate-y-px text-accent-ink" />
      <span className="text-lg leading-none font-semibold tracking-wordmark uppercase">
        Ricambi
      </span>
    </span>
  );
}

/**
 * The corner ticks a printer aligns a plate with. The archive's one ornament, because
 * everything in it was printed once.
 */
export function RegistrationGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <circle cx="8" cy="8" r="4.25" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M8 0v3.25M8 12.75V16M0 8h3.25M12.75 8H16"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="square"
      />
    </svg>
  );
}
