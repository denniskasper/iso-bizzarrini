import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { MachineTranslationTag } from '@/components/machine-translation';
import type { Position, TavolaListing } from '@/lib/api';

/**
 * **What is at a Mark, without selecting it** (issue #35): a card beside the circle a pointer is
 * resting on, or that has keyboard focus.
 *
 * It says what a member would otherwise click to find out — the number, each drawn Part's names,
 * Catalog Number and quantity — and **nothing it says is anything a click does not also show**.
 * The undrawn Parts are a count, not a list: they are the fixings, and the reading beside the
 * drawing is where they are spelled out. It holds no control, so nothing in this archive is
 * reachable by hovering alone, and a touch screen, which has no hover, misses nothing.
 */
export function PositionCard({
  position,
  listings,
}: {
  position: Position;
  /** What is listed at this Position, or `null` while the sheet's index is still being read. */
  listings: TavolaListing[] | null;
}) {
  const drawn = listings?.filter((listing) => listing.drawn) ?? [];
  const undrawn = (listings?.length ?? 0) - drawn.length;

  return (
    <div data-testid="mark-card">
      <p className="flex items-baseline gap-3">
        <span className="mark-card-number tabular" data-testid="mark-card-number">
          {position.number}
        </span>
        <span className="text-muted">Position</span>
      </p>

      {listings === null ? (
        <p className="mt-3 text-muted">Reading…</p>
      ) : listings.length === 0 ? (
        <p className="mt-3 text-muted">Nothing recorded here</p>
      ) : (
        <>
          {drawn.length > 0 && (
            <ul className="mt-3">
              {drawn.map((listing) => (
                <CardPart key={listing.id} listing={listing} />
              ))}
            </ul>
          )}
          {undrawn > 0 && (
            <p className="mt-3 text-muted" data-testid="mark-card-undrawn">
              + {undrawn} {undrawn === 1 ? 'fastener' : 'fasteners'}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** One drawn Part: what it is called in both languages, then what it is ordered by and how many. */
function CardPart({ listing }: { listing: TavolaListing }) {
  const { part } = listing;
  return (
    <li className="mark-card-part" data-testid="mark-card-part">
      <p className="font-semibold text-pretty">{part.nameEn ?? part.nameIt}</p>
      {part.nameEn !== null && (
        <p className="flex flex-wrap items-baseline gap-x-2 text-muted">
          <span lang="it">{part.nameIt}</span>
          {part.nameEnMachineTranslated && <MachineTranslationTag />}
        </p>
      )}
      <p className="mt-1 flex items-baseline justify-between gap-4">
        <span className="tabular">{part.catalogNumber ?? 'No Catalog Number'}</span>
        {listing.quantityPerCar !== null && (
          <span className="shrink-0 text-muted">
            <span className="tabular">×{listing.quantityPerCar}</span> per car
          </span>
        )}
      </p>
    </li>
  );
}

/**
 * The card, laid over the stage beside whatever it is about.
 *
 * **It follows the circle rather than the pointer**, so a keyboard gets the same card a mouse
 * does. The stage pans and magnifies its sheet without telling anyone, so while the card is shown
 * it measures the circle once a frame and moves when the circle has — one element, one
 * measurement, nothing re-rendered.
 */
export function MarkCard({ anchor, children }: { anchor: HTMLElement; children: ReactNode }) {
  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const stage = anchor.closest('.drawing-stage');
    if (!card || !stage) {
      return;
    }
    // How far it stands off the circle and off the stage's edges, as the tokens say.
    const tokens = getComputedStyle(card);
    const offset = parseFloat(tokens.getPropertyValue('--spacing-card-offset')) * rem();
    const edge = parseFloat(tokens.getPropertyValue('--spacing-card-edge')) * rem();
    let frame = 0;
    let last = '';

    const place = () => {
      // A circle taken off the sheet while its card was up — removed, or the sheet re-read.
      card.style.visibility = anchor.isConnected ? 'visible' : 'hidden';
      const at = anchor.getBoundingClientRect();
      const within = stage.getBoundingClientRect();
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      const key = `${at.left},${at.top},${within.left},${within.top},${width},${height}`;
      if (key !== last) {
        last = key;
        const middle = { x: at.left + at.width / 2 - within.left, y: at.top - within.top };
        // To the right of the circle where it fits, to the left where it does not.
        const right = middle.x + at.width / 2 + offset;
        const left =
          right + width <= within.width - edge ? right : middle.x - at.width / 2 - offset - width;
        const top = middle.y + at.height / 2 - height / 2;
        card.style.left = `${clampTo(left, edge, within.width - width - edge)}px`;
        card.style.top = `${clampTo(top, edge, within.height - height - edge)}px`;
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [anchor]);

  return (
    <div ref={cardRef} className="mark-card" role="tooltip" id={MARK_CARD_ID}>
      {children}
    </div>
  );
}

/** What the circle being described points its `aria-describedby` at. */
export const MARK_CARD_ID = 'mark-card';

/** The root font size in pixels, for the tokens written in `rem`. */
function rem(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize);
}

function clampTo(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, Math.max(low, high)));
}
