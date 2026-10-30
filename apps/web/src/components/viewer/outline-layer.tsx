import { useRef, useState, type PointerEvent } from 'react';
import type { MarkPoint, SubAssembly } from '@/lib/api';
import { fraction } from './viewport';

/**
 * **Where a Sub-assembly is on the drawing** (issue #113): the outline an Editor drew round it,
 * shown only when a member asks — by pointing at its name, selecting it, or selecting one of its
 * numbers. A sheet showing every outline at once would bury the numbers a member came to click.
 *
 * It is the pointing ice blue (ADR 0014), as a line with a wash inside it: plainly something the
 * club drew on the factory's print, and translucent so the print still reads through it.
 *
 * **Under the Marks**, in the same coordinate space: the viewer puts this between the Scan and
 * the circles, so a circle inside an outline is still what a press lands on. The SVG is laid out
 * in the drawing's own pixels and its line is `--drawing-px` wide, which the viewer keeps at one
 * of the member's pixels — so the line is the same weight at every zoom. Corners are fractions of
 * the drawing, like a Mark, and are stored already turned with it, so the outline is drawn with
 * the turn the sheet is shown at without knowing there was one.
 */
export interface OutlineLayerProps {
  /** The drawing's own size, in its pixels. */
  size: { width: number; height: number };
  /** The one Sub-assembly the drawing has been asked to show, if it has an outline. */
  shown: SubAssembly | null;
  /** The corners of an outline an Editor is drawing, in the order they were placed. */
  draft?: MarkPoint[] | null;
  /** An outline an Editor is reshaping, with its corners to drag and its sides to add one on. */
  reshaping?: Reshaping | null;
}

/** What the layer needs to let an outline be reshaped (issue #115). */
export interface Reshaping {
  corners: MarkPoint[];
  /** The corner chosen to be taken off, if one is. */
  selected: number | null;
  onSelect: (index: number) => void;
  onMove: (index: number, to: MarkPoint) => void;
}

/** An outline can be closed once it has this many corners: fewer enclose nothing. */
export const CORNERS_TO_CLOSE = 3;

/**
 * The Sub-assembly whose outline a press went down on, if it went down on one — how a tap on the
 * sheet becomes "open this Sub-assembly". A circle sits above the outline, so a press on a circle
 * is a press on the circle and never reaches here.
 */
export function outlineAt(on: Element | null): string | null {
  return (
    on?.closest('[data-sub-assembly-outline]')?.getAttribute('data-sub-assembly-outline') ?? null
  );
}

/** Whether a press went down on the first corner of an outline that can be closed there. */
export function closesTheOutline(on: Element | null): boolean {
  return on?.closest('[data-outline-close]') != null;
}

export function OutlineLayer({ size, shown, draft = null, reshaping = null }: OutlineLayerProps) {
  const points = (corners: MarkPoint[]) =>
    corners.map((corner) => `${corner.x * size.width},${corner.y * size.height}`).join(' ');

  const outline = shown?.outline ?? null;
  if (!outline && !draft && !reshaping) {
    return null;
  }

  return (
    <svg
      className="drawing-outlines"
      viewBox={`0 0 ${size.width} ${size.height}`}
      // The name beside the drawing is how a keyboard or a screen reader reaches a Sub-assembly;
      // this is the same thing drawn, and saying it twice would be noise.
      aria-hidden="true"
      data-testid="drawing-outlines"
    >
      {outline && shown && !draft && !reshaping && (
        <polygon
          key={shown.id}
          className="outline-shape"
          data-testid="sub-assembly-outline"
          data-sub-assembly-outline={shown.id}
          points={points(outline)}
        />
      )}

      {draft && <Draft corners={draft} points={points} size={size} />}
      {reshaping && <Reshape {...reshaping} points={points} size={size} />}
    </svg>
  );
}

/**
 * An outline being drawn: the corners so far, joined in order, and the side that will close it
 * dashed in. The first corner grows into something to press once there are enough to close on,
 * because that is the press that finishes it.
 */
function Draft({
  corners,
  points,
  size,
}: {
  corners: MarkPoint[];
  points: (corners: MarkPoint[]) => string;
  size: { width: number; height: number };
}) {
  const closable = corners.length >= CORNERS_TO_CLOSE;
  const [first] = corners;

  return (
    <g data-testid="outline-draft" data-corners={corners.length}>
      {closable && <polygon className="outline-draft-fill" points={points(corners)} />}
      <polyline className="outline-draft-line" points={points(corners)} />
      {corners.map((corner, index) => (
        <circle
          // Corners are a list being appended to; the place is the identity.
          key={index}
          className="outline-corner"
          data-first={index === 0}
          cx={corner.x * size.width}
          cy={corner.y * size.height}
        />
      ))}
      {closable && first && (
        <circle
          className="outline-close"
          data-outline-close=""
          data-testid="outline-close"
          cx={first.x * size.width}
          cy={first.y * size.height}
        />
      )}
    </g>
  );
}

/**
 * An outline being reshaped (issue #115): drawn as it stands, each corner a dot to drag, each side
 * a band to click a new corner onto. Both are a thumb wide at every zoom, like the corner that
 * closes a draft, and the corners are on top, so a press near a corner takes the corner.
 *
 * A corner is held here while a hand moves it and handed on only when it is let go, which is when
 * the outline is saved — a drag is one change, not one per frame.
 */
function Reshape({
  corners,
  selected,
  onSelect,
  onMove,
  points,
  size,
}: Reshaping & {
  points: (corners: MarkPoint[]) => string;
  size: { width: number; height: number };
}) {
  const layer = useRef<SVGGElement>(null);
  const [held, setHeld] = useState<{ index: number; at: MarkPoint; moved: boolean } | null>(null);
  const shown = held
    ? corners.map((corner, index) => (index === held.index ? held.at : corner))
    : corners;

  function pointOnSheet(event: PointerEvent<SVGElement>): MarkPoint | null {
    const box = layer.current?.ownerSVGElement?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) {
      return null;
    }
    return {
      x: fraction(event.clientX - box.left, box.width),
      y: fraction(event.clientY - box.top, box.height),
    };
  }

  function letGo(event: PointerEvent<SVGCircleElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (held?.moved && event.type === 'pointerup') {
      onMove(held.index, held.at);
    }
    setHeld(null);
  }

  return (
    <g ref={layer} data-testid="outline-reshape" data-corners={corners.length}>
      <polygon className="outline-shape outline-reshaping" points={points(shown)} />
      {shown.map((corner, index) => {
        const next = shown[(index + 1) % shown.length] ?? corner;
        return (
          <line
            // A side is the corners either end of it; the place is the identity.
            key={index}
            className="outline-side"
            data-outline-side={index}
            data-testid="outline-side"
            x1={corner.x * size.width}
            y1={corner.y * size.height}
            x2={next.x * size.width}
            y2={next.y * size.height}
          />
        );
      })}
      {shown.map((corner, index) => (
        <g key={index}>
          <circle
            className="outline-corner"
            data-selected={index === selected}
            cx={corner.x * size.width}
            cy={corner.y * size.height}
          />
          <circle
            className="outline-handle"
            data-testid="outline-corner"
            data-selected={index === selected}
            cx={corner.x * size.width}
            cy={corner.y * size.height}
            // Picking up a corner is not moving the drawing: the press stops here.
            onPointerDown={(event) => {
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              onSelect(index);
              setHeld({ index, at: corner, moved: false });
            }}
            onPointerMove={(event) => {
              const at = held?.index === index ? pointOnSheet(event) : null;
              if (at) {
                setHeld({ index, at, moved: true });
              }
            }}
            onPointerUp={letGo}
            onPointerCancel={letGo}
          />
        </g>
      ))}
    </g>
  );
}
