import { ArrowDownToLine, ArrowUpToLine } from 'lucide-react';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { Button } from '@/components/ui/button';

/**
 * **Up to the number, down to the end of the list** (issue #213). A sheet with a lot of parts is
 * a long way to scroll with a cold thumb, and the two places a hand keeps scrolling to are the
 * head of the facing page — the number box and the part being read — and the last row.
 *
 * Each arrow sits at the edge it goes to, centred on the list: ↑ pinned under the chrome, ↓ at
 * the window's foot, so which way a button goes is where it is as well as what it shows. Each is
 * the zoom control's pill, because it is the same kind of thing: an instrument for moving around,
 * not an action on the archive. They are only there while the list is on the screen and taller
 * than the window — a sheet that fits has nowhere to jump to — and each only when it would move
 * you.
 *
 * Two pieces rather than one component, because a pin to the top has to begin at the top of the
 * list and a pin to the foot at its foot: `top` goes first in the list, `bottom` last.
 *
 * Scroll only. The number box is not focused, which would open a phone's keyboard over half of
 * what was just scrolled to. Focus goes where a screen reader and the next Tab should carry on
 * from: the head itself, so the next Tab is the number box, and the last row at the end.
 */
export function usePartsJump(
  /** The head of the facing page, which ↑ goes back to. */
  head: HTMLElement | null,
  /** The sheet's parts, whose end ↓ goes to and whose height decides whether there is a jump. */
  list: RefObject<HTMLElement | null>,
): { top: ReactNode; bottom: ReactNode } {
  const where = useWhereTheListIs(list);

  return {
    top: (
      <div className="parts-jump parts-jump-top">
        {where.up && head && (
          <Arrow label="Back to the top of the parts" onClick={() => jumpTo(head, 'start', head)}>
            <ArrowUpToLine />
          </Arrow>
        )}
      </div>
    ),
    bottom: (
      <div className="parts-jump parts-jump-bottom">
        {where.down && (
          <Arrow
            label="To the end of the parts"
            onClick={() =>
              list.current &&
              jumpTo(list.current, 'end', list.current.querySelector('ul > li:last-child button'))
            }
          >
            <ArrowDownToLine />
          </Arrow>
        )}
      </div>
    ),
  };
}

function Arrow({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="instrument-rail">
      <Button variant="ghost" size="icon" aria-label={label} title={label} onClick={onClick}>
        {children}
      </Button>
    </div>
  );
}

function jumpTo(target: HTMLElement, block: 'start' | 'end', focus: HTMLElement | null) {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ block, behavior: still ? 'auto' : 'smooth' });
  // The arrow that was pressed is gone once it has arrived, so focus is handed on rather than
  // dropped on the page. The head is not focusable of itself, and is made so only from here.
  if (focus) {
    if (!focus.matches('button, a, input')) {
      focus.tabIndex = -1;
    }
    focus.focus({ preventScroll: true });
  }
}

/** Which arrows are there: each only when it would move you, and only where it fits. */
type Where = { up: boolean; down: boolean };

const NOWHERE: Where = { up: false, down: false };

/** Within a pixel is there: a page scrolled to a fraction never quite lands on a whole one. */
const SLACK = 1;

/**
 * The gap, in rem, a pill keeps from the edge it is pinned to — `--spacing(4)` in `.parts-jump-*`.
 * With the control's own height it is how far the pill reaches in, and an arrow is only shown
 * while the list has that much of itself on the screen, so it never hangs off the list's end
 * over the page's other sections.
 */
const GAP_REM = 1;

/** Where the list sits against the window, kept current as the page scrolls and the list grows. */
function useWhereTheListIs(list: RefObject<HTMLElement | null>): Where {
  const [where, setWhere] = useState<Where>(NOWHERE);

  useEffect(() => {
    const element = list.current;
    if (!element) {
      return;
    }

    let frame = 0;
    const measure = () => {
      frame = 0;
      const root = getComputedStyle(document.documentElement);
      const chrome = parseFloat(root.getPropertyValue('--chrome-height')) || 0;
      const rem = parseFloat(root.fontSize);
      const reach = (GAP_REM + parseFloat(root.getPropertyValue('--spacing-control'))) * rem;
      const viewport = window.innerHeight;
      const box = element.getBoundingClientRect();
      // A sheet that fits the window has nowhere to jump to.
      const long = box.height > viewport - chrome;
      const next: Where = {
        // The list's own top under the chrome, not merely the head's: until it is, the head is a
        // short scroll away and an arrow pinned there would sit over the list's own heading.
        up: long && box.top < chrome - SLACK && box.bottom > chrome + reach,
        down: long && box.bottom > viewport + SLACK && box.top < viewport - reach,
      };
      setWhere((was) => (was.up === next.up && was.down === next.down ? was : next));
    };
    const soon = () => {
      if (!frame) {
        frame = requestAnimationFrame(measure);
      }
    };

    measure();
    window.addEventListener('scroll', soon, { passive: true });
    window.addEventListener('resize', soon);
    const observer = new ResizeObserver(soon);
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', soon);
      window.removeEventListener('resize', soon);
      observer.disconnect();
    };
  }, [list]);

  return where;
}
