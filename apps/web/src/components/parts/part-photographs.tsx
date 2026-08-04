import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import type { Photograph } from '@/lib/api';

/**
 * What the Part looks like — **the check no part number can give anybody** (story 77).
 *
 * A member with a bracket in their hand is not comparing a description. Two calipers that differ
 * only in where a boss sits have the same words written about them and the same catalog note
 * transcribed under both; the picture is what settles it, and it settles it without being read.
 * That is why this sits directly under the Part's name and *above* the two numbers: the numbers
 * are what you quote once you are sure, and this is how you become sure.
 *
 * **The first photograph is set large and the rest are a strip beneath it**, which is the Part's
 * own order made visible. An Editor decides which picture identifies the component; a layout that
 * showed six equal thumbnails would make that decision invisible and therefore not worth making.
 */
export function PartPhotographs({
  photographs,
  partName,
}: {
  photographs: Photograph[];
  partName: string;
}) {
  /** Which photograph is filling the screen, if any. Nothing is expanded on arrival. */
  const [expandedAt, setExpandedAt] = useState<number | null>(null);

  if (photographs.length === 0) {
    // Said nowhere rather than said as an absence. A Position carrying five Parts would otherwise
    // print "no photographs" five times, which is a column of denials to read past.
    return null;
  }

  const [lead, ...rest] = photographs;
  if (!lead) {
    return null;
  }

  return (
    <div className="mt-5" data-testid="photographs">
      {/* Bounded, not merely proportioned. The picture settles what the words cannot, and then a
          member wants the number they are going to quote — which should not be a scroll away on
          a phone because the photograph took the whole column. */}
      <Thumbnail
        photograph={lead}
        label={caption(partName, 1, photographs.length)}
        className="aspect-[4/3] max-h-52 w-full"
        onOpen={() => setExpandedAt(0)}
      />

      {rest.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {rest.map((photograph, index) => (
            <li key={photograph.id}>
              <Thumbnail
                photograph={photograph}
                label={caption(partName, index + 2, photographs.length)}
                // Well over the 44px floor: these are pictures to recognise at arm's length in
                // poor light, not controls to hit.
                className="size-20"
                onOpen={() => setExpandedAt(index + 1)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Bounded by the list rather than only by "something is open": an Editor who removes the
          photograph they had expanded would otherwise leave a layer covering the page with
          nothing in it. */}
      {expandedAt !== null && expandedAt < photographs.length && (
        <Expanded
          photographs={photographs}
          at={expandedAt}
          partName={partName}
          onMove={setExpandedAt}
          onClose={() => setExpandedAt(null)}
        />
      )}
    </div>
  );
}

/** What a photograph is announced as. There is no caption field, so the Part's name is the fact. */
function caption(partName: string, at: number, total: number): string {
  return total === 1 ? `Photograph of ${partName}` : `Photograph ${at} of ${total} of ${partName}`;
}

/**
 * One photograph, at the size the layout gives it.
 *
 * A button rather than a link: it opens the picture on this screen rather than going anywhere.
 * The `img` inside carries no alt of its own — the button is what a screen reader announces, and
 * announcing the same photograph twice is worse than announcing it once.
 */
function Thumbnail({
  photograph,
  label,
  className,
  onOpen,
}: {
  photograph: Photograph;
  label: string;
  className: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={`photograph ${className}`}
      aria-label={`${label}. View it larger.`}
      data-testid="photograph"
      onClick={onOpen}
    >
      <img
        src={photograph.previewUrl}
        alt=""
        width={photograph.width}
        height={photograph.height}
        // A member scrolling a Position's Parts is scrolling past most of these; only the ones
        // that reach the screen are worth a request.
        loading="lazy"
        decoding="async"
      />
    </button>
  );
}

/**
 * The photograph filling the screen, which is what "larger" means in this archive.
 *
 * **Not a dialogue box over the page**, which is the same argument `.editor-panel` makes: this is
 * a printed index, and chrome floating over the artwork is exactly what the interface stays out
 * of the way of. What is offered instead is the one the drawing viewer already offers — the
 * picture is the only thing on the glass, with one chip of chrome in the corner a thumb reaches.
 *
 * **Stepping between them is here and not a nicety.** A member who opens the second of three and
 * finds no way to the third has to close, find the strip again and open another — on a phone, in
 * a garage, with one hand. So the arrow keys work, and there are two controls beside the way out.
 */
function Expanded({
  photographs,
  at,
  partName,
  onMove,
  onClose,
}: {
  photographs: Photograph[];
  at: number;
  partName: string;
  onMove: (at: number) => void;
  onClose: () => void;
}) {
  const closer = useRef<HTMLButtonElement>(null);

  const photograph = photographs[at];
  const step = useCallback(
    (by: number) => onMove((at + by + photographs.length) % photographs.length),
    [at, onMove, photographs.length],
  );

  /** The way out has the focus, so a keyboard is never stranded behind the picture. */
  useEffect(() => {
    closer.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowLeft' && photographs.length > 1) {
        event.preventDefault();
        step(-1);
      } else if (event.key === 'ArrowRight' && photographs.length > 1) {
        event.preventDefault();
        step(1);
      }
    }

    // Escape, and nothing scrolling behind something that is covering the page. The class is the
    // one the drawing's own full screen sets, because it says the same thing about the page.
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('image-expanded');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('image-expanded');
    };
  }, [onClose, photographs.length, step]);

  if (!photograph) {
    return null;
  }

  /**
   * **Rendered on the body rather than where it was asked for**, which is not fastidiousness.
   * This layer is `position: fixed`, and a fixed element is laid out against the nearest
   * ancestor carrying a transform rather than against the viewport — so anything that ever
   * animates one of the panels between here and the page would silently clip a picture that is
   * supposed to be covering the screen. It has happened once already. A portal has no ancestors
   * to be clipped by.
   */
  return createPortal(
    <div
      className="photograph-expanded"
      role="dialog"
      aria-modal="true"
      aria-label={caption(partName, at + 1, photographs.length)}
      data-testid="photograph-expanded"
    >
      <img
        src={photograph.displayUrl}
        alt={caption(partName, at + 1, photographs.length)}
        width={photograph.width}
        height={photograph.height}
        decoding="async"
        fetchPriority="high"
      />

      <div className="instrument-rail absolute top-3 right-3">
        {photographs.length > 1 && (
          <>
            <p className="px-3 text-sm text-muted">
              <span className="tabular">
                {at + 1} of {photographs.length}
              </span>
            </p>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous photograph"
              onClick={() => step(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next photograph"
              onClick={() => step(1)}
            >
              <ChevronRight />
            </Button>
          </>
        )}
        <Button ref={closer} variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>
    </div>,
    document.body,
  );
}
