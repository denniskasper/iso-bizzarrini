import { memo, useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Mark, MarkPoint, Position } from '@/lib/api';
import { fraction } from './viewport';

/**
 * The numbered circles on a drawing — the thing the whole product is a sentence about:
 * *choose your car, open the drawing, click the position, read the part.*
 *
 * **A ring and never a disc.** What a Mark points at is printed underneath it, and a filled dot
 * would cover the very number a member is trying to read. It is the Club's teal, which the
 * visual language sanctions for exactly four things and this is the second of them.
 *
 * **The layer knows nothing about zoom.** It positions every circle as a percentage of the
 * drawing, inside the drawing's own coordinate space, so the single transform that pans and
 * magnifies the sheet carries the circles with it — pinned, at every magnification, with no
 * arithmetic per frame and nothing to fall out of step. The two sizes a circle has arrive as
 * CSS variables the viewer keeps: `--mark-ring`, fixed to the sheet, and `--mark-touch`, which
 * is whatever the drawing's own pixels have to be to make 44 of the member's.
 */

/** A Mark's place on the sheet while a hand is still holding it. */
interface Held {
  markId: string;
  x: number;
  y: number;
  moved: boolean;
}

export interface MarkLayerProps {
  positions: Position[];
  /** Which Position is being read — all of its circles light, because they are one Position. */
  selectedPositionId: string | null;
  onSelect: (position: Position, mark: Mark) => void;
  /**
   * Moving a circle an Editor put in the wrong place. Absent for a member, which is what makes
   * the drawing read-only rather than a control surface with the actions hidden.
   */
  onMove?: ((markId: string, to: MarkPoint) => Promise<unknown>) | undefined;
}

export function MarkLayer({ positions, selectedPositionId, onSelect, onMove }: MarkLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  /**
   * The drag lives in a ref and is *mirrored* into state for rendering. Both, deliberately: a
   * handler that closed over the state would be a new function on every frame of a drag, and
   * the whole point of memoising a circle is that dragging one does not re-render the other
   * hundred and ninety-nine.
   */
  const heldRef = useRef<Held | null>(null);
  const [held, setHeld] = useState<Held | null>(null);

  const settle = useCallback((next: Held | null) => {
    heldRef.current = next;
    setHeld(next);
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  /** Where a pointer is on the sheet, as fractions of it — this layer *is* the sheet. */
  const pointOnSheet = useCallback((event: { clientX: number; clientY: number }) => {
    const box = layerRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) {
      return null;
    }
    return {
      x: fraction(event.clientX - box.left, box.width),
      y: fraction(event.clientY - box.top, box.height),
    };
  }, []);

  const takeHold = useCallback(
    (mark: Mark, event: PointerEvent<HTMLButtonElement>) => {
      if (!onMove) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      settle({ markId: mark.id, x: mark.x, y: mark.y, moved: false });
    },
    [onMove, settle],
  );

  const dragTo = useCallback(
    (mark: Mark, event: PointerEvent<HTMLButtonElement>) => {
      if (heldRef.current?.markId !== mark.id || frame.current !== 0) {
        return;
      }

      const at = pointOnSheet(event);
      if (!at) {
        return;
      }

      // One place a frame, like the sheet underneath it: a pointer reports far faster than
      // anything should re-render, and a circle only has to keep up with a thumb.
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        settle({ markId: mark.id, ...at, moved: true });
      });
    },
    [pointOnSheet, settle],
  );

  const letGo = useCallback(
    (mark: Mark, event: PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const holding = heldRef.current;
      if (holding?.markId !== mark.id) {
        return;
      }

      // A press that never moved is somebody reading, not somebody correcting, and it is the
      // click that answers it. Nothing is written for a circle that stayed where it was.
      if (!holding.moved || !onMove) {
        settle(null);
        return;
      }

      // Held until the archive has it. Letting go the moment the request leaves would snap the
      // circle back to where it started and then move it again, which reads as a glitch rather
      // than as a drag. If the request fails it snaps back once, which is the truth.
      void onMove(mark.id, { x: holding.x, y: holding.y }).finally(() => settle(null));
    },
    [onMove, settle],
  );

  return (
    <div ref={layerRef} className="drawing-marks" data-testid="drawing-marks">
      {positions.map((position) =>
        position.marks.map((mark) => (
          <MarkCircle
            key={mark.id}
            mark={held?.markId === mark.id ? { ...mark, x: held.x, y: held.y } : mark}
            position={position}
            selected={position.id === selectedPositionId}
            movable={onMove !== undefined}
            onSelect={onSelect}
            onTakeHold={takeHold}
            onDragTo={dragTo}
            onLetGo={letGo}
          />
        )),
      )}
    </div>
  );
}

/**
 * One circle, memoised: a Tavola carries hundreds of them, and everything above is arranged so
 * that dragging one changes the props of exactly one.
 */
const MarkCircle = memo(function MarkCircle({
  mark,
  position,
  selected,
  movable,
  onSelect,
  onTakeHold,
  onDragTo,
  onLetGo,
}: {
  mark: Mark;
  position: Position;
  selected: boolean;
  movable: boolean;
  onSelect: (position: Position, mark: Mark) => void;
  onTakeHold: (mark: Mark, event: PointerEvent<HTMLButtonElement>) => void;
  onDragTo: (mark: Mark, event: PointerEvent<HTMLButtonElement>) => void;
  onLetGo: (mark: Mark, event: PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className="drawing-mark"
      data-testid="drawing-mark"
      data-position={position.number}
      data-selected={selected}
      aria-label={`Position ${position.number}`}
      aria-pressed={selected}
      style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%` }}
      /*
       * **Pointing at a circle reads it, and the sheet is still the member's to drag.**
       *
       * Selecting on the press rather than on the click is what makes both of those true at
       * once. The viewer captures the pointer to pan, which on a press that began here would
       * take the click with it — so a circle that waited for one would either never be read, or
       * would have to stop the press and leave a member unable to drag a sheet by the part of
       * it that has a circle on it. On a Tavola carrying two hundred, that is most of the sheet.
       *
       * While the marking tool is on it is the other way round: a press on a circle is an
       * Editor picking it up, so it does stop there and the drawing stays where it is.
       */
      onPointerDown={(event) => {
        onSelect(position, mark);
        if (!movable) {
          return;
        }
        event.stopPropagation();
        onTakeHold(mark, event);
      }}
      onPointerMove={movable ? (event) => onDragTo(mark, event) : undefined}
      onPointerUp={movable ? (event) => onLetGo(mark, event) : undefined}
      onPointerCancel={movable ? (event) => onLetGo(mark, event) : undefined}
      // For a keyboard, which produces a click and no press at all.
      onClick={() => onSelect(position, mark)}
    />
  );
});
