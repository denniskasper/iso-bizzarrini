import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MachineTranslationTag } from '@/components/machine-translation';
import type { Position, TavolaListing } from '@/lib/api';

/**
 * **What is at a Mark, without selecting it** (issue #35): a card for the circle a pointer is
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
        {/* Pointed at, not read: the reading in the column says "Position" for the number that
            was selected, and is back as soon as the pointer leaves. */}
        <span className="text-muted">Pointed at</span>
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

/** Wide enough for the reading to stand beside the drawing: the Tavola page's `lg`. */
const BESIDE = '(width >= 64rem)';

/** Whether the column beside the drawing is there to hold the card. */
export function useBeside(): boolean {
  const [beside, setBeside] = useState(() => matchMedia(BESIDE).matches);
  useEffect(() => {
    const query = matchMedia(BESIDE);
    const changed = () => setBeside(query.matches);
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);
  return beside;
}

/**
 * **The card, never over the drawing it is about.** Laid beside the circle, it hid the very
 * parts round it, and at a size readable at arm's length it hid half the sheet. Where the reading
 * stands beside the drawing, the card is shown in that column instead, level with the sheet and
 * over what the column was showing, until the pointer leaves. Where there is no column, or the
 * drawing has the whole screen, it is a strip along the stage's edge: the bottom, or the top when
 * the circle is in the bottom half, so it never covers the circle it describes.
 *
 * **It follows the circle rather than the pointer**, so a keyboard gets the same card a mouse
 * does. The stage pans and magnifies its sheet without telling anyone, so while the card is shown
 * it measures once a frame and moves when something has: one element, nothing re-rendered.
 */
export function MarkCard({
  anchor,
  beside,
  children,
}: {
  anchor: HTMLElement;
  /** Where the column keeps the card, or `null` where there is no column to keep it. */
  beside: HTMLElement | null;
  children: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const wide = useBeside();
  const stage = anchor.closest<HTMLElement>('.drawing-stage');
  const [expanded, setExpanded] = useState(stage?.dataset.expanded === 'true');
  const inColumn = wide && !expanded && beside !== null;

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || !stage) {
      return;
    }
    const edge = parseFloat(getComputedStyle(card).getPropertyValue('--spacing-card-edge')) * rem();
    let frame = 0;
    let last = '';

    const place = () => {
      // A circle taken off the sheet while its card was up — removed, or the sheet re-read.
      card.style.visibility = anchor.isConnected ? 'visible' : 'hidden';
      setExpanded(stage.dataset.expanded === 'true');
      const at = anchor.getBoundingClientRect();
      const within = stage.getBoundingClientRect();
      if (inColumn && beside) {
        // Level with the top of the sheet, kept clear of the page's own chrome as the page
        // scrolls, and never further down than the bottom of the sheet it is about.
        const host = beside.getBoundingClientRect();
        const chrome = document.querySelector('[data-chrome]')?.getBoundingClientRect().bottom ?? 0;
        const height = card.offsetHeight;
        const key = `${host.top},${within.top},${within.bottom},${chrome},${height}`;
        if (key !== last) {
          last = key;
          const top = Math.max(within.top, chrome + edge) - host.top;
          card.style.top = `${clampTo(top, 0, within.bottom - host.top - height)}px`;
        }
      } else {
        const low = at.top + at.height / 2 - within.top > within.height / 2;
        card.dataset.dock = low ? 'top' : 'bottom';
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [anchor, beside, inColumn, stage]);

  const card = (
    <div
      ref={cardRef}
      className={inColumn ? 'mark-card mark-card-beside' : 'mark-card mark-card-docked'}
      role="tooltip"
      id={MARK_CARD_ID}
    >
      {children}
    </div>
  );
  return inColumn && beside ? createPortal(card, beside) : card;
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
