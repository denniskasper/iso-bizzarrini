import { Maximize2, Minimize2, Scan as FitToFrame, ZoomIn, ZoomOut } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Plate } from '@/components/plate';
import { Button } from '@/components/ui/button';
import type { TavolaScan } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useFullScreen } from './use-full-screen';
import {
  centredOn,
  clamped,
  fitted,
  focusOf,
  formatMagnification,
  magnification,
  maxScale,
  panned,
  visibleRegion,
  zoomedAbout,
  zoomedBy,
  type Point,
  type Size,
  type Stage,
  type Viewport,
} from './viewport';

/**
 * The surface the whole product is for: a factory drawing, read the way a member needs to read
 * it — the whole sheet first, then close enough to make out a position number on a phone, in a
 * garage, without losing track of where they are.
 *
 * **The interface recedes and the drawing is the hero.** There is no chrome over the sheet but
 * one instrument panel in a corner and a navigator that appears only once there is something
 * off-screen for it to point at.
 *
 * **One image, panned and zoomed here rather than a tile pyramid fetched as you go** — that is
 * ADR 0013, decided at ticket 03 and reversible: everything below works in fractional image
 * coordinates, so the day the archive is measured and turns out to want tiles, the arithmetic
 * in `viewport.ts` does not change.
 */
export function DrawingViewer({
  scan,
  alt,
  className,
}: {
  scan: TavolaScan | null;
  alt: string;
  className?: string;
}) {
  // A Tavola recorded from a paper catalog before anyone has scanned the sheet is a legitimate
  // state, and it says so in one place — here it is the same empty plate a contact sheet shows.
  if (!scan) {
    return <Plate scan={null} alt={alt} className={cn('h-64', className)} />;
  }

  // Keyed by the scan, so an Editor replacing one gets a viewer that opens on the new sheet at
  // the whole of it. Carrying the old magnification onto a different drawing would break the
  // one promise this screen makes on every open.
  return <Viewer key={scan.id} scan={scan} alt={alt} className={className} />;
}

/** A press of the magnifier, and what a double-click is worth. */
const ZOOM_STEP = 2;

/** How far one press of an arrow key moves the sheet, in frame pixels. */
const KEYBOARD_PAN = 64;

/** A wheel notch reports about 100 units; this makes one notch about a 16% change. */
const WHEEL_SENSITIVITY = 0.0015;

/** A wheel reporting in lines rather than pixels means about this many pixels a line. */
const PIXELS_PER_LINE = 16;

const PAN_KEYS: Record<string, Point> = {
  ArrowLeft: { x: 1, y: 0 },
  ArrowRight: { x: -1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
};

/** Where a pointer is inside an element, in that element's own pixels. */
function pointIn(element: Element, event: { clientX: number; clientY: number }): Point {
  const box = element.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

/** How far along something a point is, never past either end of it. */
function fraction(along: number, extent: number): number {
  return extent <= 0 ? 0 : Math.min(1, Math.max(0, along / extent));
}

function Viewer({ scan, alt, className }: { scan: TavolaScan; alt: string; className?: string }) {
  const image = useMemo<Size>(
    () => ({ width: scan.width, height: scan.height }),
    [scan.width, scan.height],
  );

  const [sheetLoaded, setSheetLoaded] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const navigatorRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);

  const { expanded, toggle: toggleFullScreen } = useFullScreen(stageRef);

  /**
   * **Where the drawing is does not live in React state**, and that is the whole answer to
   * "panning stays responsive on a mid-range phone": a pointer moving across a screen produces
   * events far faster than a component should re-render, so the viewport is a ref, every gesture
   * writes to it, and one animation frame later `paint` puts it on the elements directly. React
   * renders this component when the member enters full screen and when the drawing arrives, and
   * at no other time.
   */
  const viewportRef = useRef<Viewport>({ scale: 1, x: 0, y: 0 });
  const stageOf = useRef<Stage>({ image, frame: { width: 0, height: 0 } });
  /** Whether the member has moved it themselves — a sheet nobody has touched re-fits on resize. */
  const movedRef = useRef(false);
  const paintRef = useRef(0);

  const paint = useCallback(() => {
    const viewport = viewportRef.current;
    const stage = stageOf.current;

    if (sceneRef.current) {
      // `translate3d` and not `left`/`top`: this is the one property a browser can move without
      // touching layout, which is what keeps a finger and the sheet under it together.
      sceneRef.current.style.transform = `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`;
    }

    if (regionRef.current) {
      const region = visibleRegion(viewport, stage);
      regionRef.current.style.left = `${region.x * 100}%`;
      regionRef.current.style.top = `${region.y * 100}%`;
      regionRef.current.style.width = `${region.width * 100}%`;
      regionRef.current.style.height = `${region.height * 100}%`;
    }

    const times = magnification(viewport, stage);
    if (readoutRef.current) {
      readoutRef.current.textContent = formatMagnification(times);
    }
    if (navigatorRef.current) {
      // The navigator has nothing to say while the whole sheet is on screen, so it is not there.
      navigatorRef.current.dataset['visible'] = String(times > 1.01);
    }
  }, []);

  const move = useCallback(
    (next: Viewport) => {
      viewportRef.current = next;
      if (paintRef.current !== 0) {
        return;
      }
      paintRef.current = requestAnimationFrame(() => {
        paintRef.current = 0;
        paint();
      });
    },
    [paint],
  );

  useEffect(() => () => cancelAnimationFrame(paintRef.current), []);

  /**
   * The frame's size, and the promise that the whole drawing fits it — **every time**, which
   * includes a phone being turned over and the member entering full screen, not only the moment
   * the page opens. A member who has moved the sheet themselves keeps what they were looking at
   * instead: re-fitting under someone mid-way through reading a number would be the viewer
   * taking the drawing off them.
   */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) {
        return;
      }

      const before = stageOf.current;
      const stage = { image, frame: { width: box.width, height: box.height } };
      stageOf.current = stage;

      if (movedRef.current && before.frame.width > 0 && before.frame.height > 0) {
        const focus = focusOf(viewportRef.current, before);
        viewportRef.current = centredOn(focus, clamped(viewportRef.current, stage), stage);
      } else {
        viewportRef.current = fitted(stage);
      }

      // Painted now rather than next frame: a resize observer runs before the browser paints,
      // so the drawing is never shown for a frame at the size the frame used to be.
      paint();
    });

    observer.observe(frame);
    return () => observer.disconnect();
  }, [image, paint]);

  const zoom = useCallback(
    (factor: number) => {
      movedRef.current = true;
      move(zoomedBy(factor, viewportRef.current, stageOf.current));
    },
    [move],
  );

  const fit = useCallback(() => {
    movedRef.current = false;
    move(fitted(stageOf.current));
  }, [move]);

  /**
   * The wheel zooms about the pointer, and never scrolls the page out from under the drawing.
   * A trackpad's pinch arrives here too — as a wheel event carrying `ctrlKey` — and means the
   * same thing, only harder.
   *
   * Zoom rather than scroll is the convention this product's own specification named when it
   * named OpenSeadragon, and it is what a member who has used a map expects; the sheet is moved
   * by dragging it, which is what a member who has used paper expects.
   */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const frameElement = frameRef.current;
      if (!frameElement) {
        return;
      }

      const delta =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * PIXELS_PER_LINE
          : event.deltaY;
      const viewport = viewportRef.current;

      movedRef.current = true;
      move(
        zoomedAbout(
          viewport,
          pointIn(frameElement, event),
          viewport.scale * Math.exp(-delta * WHEEL_SENSITIVITY),
          stageOf.current,
        ),
      );
    }

    // Not React's `onWheel`, which is attached passively and therefore cannot stop the page
    // scrolling behind the drawing.
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [move]);

  /**
   * Fingers and mouse, through one set of events. One pointer drags the sheet; two pinch it,
   * about the point between them, and drag it at the same time — which is what a hand actually
   * does rather than two gestures a member has to choose between.
   */
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; middle: Point } | null>(null);
  const frameOrigin = useRef<Point>({ x: 0, y: 0 });

  const gesture = useCallback(() => {
    const [first, second] = [...pointers.current.values()];
    if (!first || !second) {
      return null;
    }
    return {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      middle: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    };
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const box = event.currentTarget.getBoundingClientRect();
    frameOrigin.current = { x: box.left, y: box.top };
    pinch.current = pointers.current.size === 2 ? gesture() : null;
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) {
      return;
    }

    const current = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, current);
    movedRef.current = true;

    const viewport = viewportRef.current;
    const stage = stageOf.current;

    if (pointers.current.size === 1) {
      move(panned(viewport, { x: current.x - previous.x, y: current.y - previous.y }, stage));
      return;
    }

    const held = pinch.current;
    const next = gesture();
    if (!held || !next || held.distance < 1) {
      return;
    }

    // Zoom about where the two fingers were, then follow where they have moved to — so a hand
    // that spreads and slides at once does both.
    const origin = frameOrigin.current;
    const magnified = zoomedAbout(
      viewport,
      { x: held.middle.x - origin.x, y: held.middle.y - origin.y },
      viewport.scale * (next.distance / held.distance),
      stage,
    );
    pinch.current = next;
    move(
      panned(
        magnified,
        { x: next.middle.x - held.middle.x, y: next.middle.y - held.middle.y },
        stage,
      ),
    );
  }

  function onPointerRelease(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // A finger lifted from a pinch leaves the other one dragging, from where it is now.
    pinch.current = pointers.current.size === 2 ? gesture() : null;
  }

  /** A double tap goes in a step, at what was tapped — and comes all the way back out at the top. */
  function onDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    const stage = stageOf.current;

    if (viewport.scale >= maxScale(stage)) {
      fit();
      return;
    }

    movedRef.current = true;
    move(
      zoomedAbout(viewport, pointIn(event.currentTarget, event), viewport.scale * ZOOM_STEP, stage),
    );
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const direction = PAN_KEYS[event.key];
    if (direction) {
      event.preventDefault();
      movedRef.current = true;
      move(
        panned(
          viewportRef.current,
          { x: direction.x * KEYBOARD_PAN, y: direction.y * KEYBOARD_PAN },
          stageOf.current,
        ),
      );
      return;
    }

    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoom(ZOOM_STEP);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoom(1 / ZOOM_STEP);
    } else if (event.key === '0') {
      event.preventDefault();
      fit();
    } else if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      toggleFullScreen();
    }
  }

  /**
   * Pointing at the navigator moves the view there, which is the fastest way back to a corner.
   *
   * A convenience for a hand and nothing a member depends on: everything it does is also on the
   * arrow keys, which is why it is announced as the picture it is rather than added to the tab
   * order as a control that would do nothing useful when focused.
   */
  function onNavigatorPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.type === 'pointermove' && event.buttons === 0) {
      return;
    }
    if (event.type === 'pointerdown') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    const map = mapRef.current;
    if (!map) {
      return;
    }

    // Measured against the map and not the box around it: where the two differ, the box is only
    // there to be big enough to hit, and pointing into that margin means the edge of the sheet.
    const box = map.getBoundingClientRect();
    const at = pointIn(map, event);
    movedRef.current = true;
    move(
      centredOn(
        { x: fraction(at.x, box.width), y: fraction(at.y, box.height) },
        viewportRef.current,
        stageOf.current,
      ),
    );
  }

  const landscape = image.width >= image.height;

  return (
    <div
      ref={stageRef}
      data-testid="drawing-stage"
      data-expanded={expanded}
      className={cn('drawing-stage', className)}
    >
      <div
        ref={frameRef}
        data-testid="drawing-frame"
        className="drawing-frame"
        tabIndex={0}
        role="group"
        aria-label={`${alt}. Drag to move the drawing, scroll or pinch to zoom.`}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight + - 0 f"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerRelease}
        onPointerCancel={onPointerRelease}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
      >
        <div
          ref={sceneRef}
          className="drawing-scene"
          style={{ width: image.width, height: image.height }}
        >
          {/*
           * The thumbnail first, at the drawing's full size — coarse, but it is the same image
           * the contact sheet just showed, so it is already in this browser and the sheet is on
           * screen the instant the page is. The drawing itself replaces it when it arrives.
           */}
          {!sheetLoaded && (
            <img
              src={scan.previewUrl}
              alt=""
              aria-hidden="true"
              decoding="async"
              draggable={false}
            />
          )}
          <img
            src={scan.displayUrl}
            alt={alt}
            decoding="async"
            fetchPriority="high"
            draggable={false}
            onLoad={() => setSheetLoaded(true)}
          />
        </div>
      </div>

      <div
        ref={navigatorRef}
        data-testid="drawing-navigator"
        data-visible="false"
        role="img"
        aria-label="Which part of the drawing is in view"
        className="drawing-navigator absolute top-3 right-3"
        onPointerDown={onNavigatorPointer}
        onPointerMove={onNavigatorPointer}
      >
        {/*
         * The map keeps the drawing's proportions exactly, so the lit rectangle lands where the
         * member is actually looking; the box around it never goes under the 44px a cold hand
         * needs, however long and thin the sheet is.
         */}
        <div
          ref={mapRef}
          className={cn('drawing-map', landscape ? 'w-36' : 'h-36')}
          style={{ aspectRatio: `${image.width} / ${image.height}` }}
        >
          <img src={scan.previewUrl} alt="" aria-hidden="true" draggable={false} />
          <div ref={regionRef} data-testid="drawing-region" className="drawing-region" />
        </div>
      </div>

      <div className="drawing-rail absolute right-3 bottom-3">
        <p className="px-3 text-sm text-muted">
          <span className="sr-only">Magnification </span>
          <span ref={readoutRef} data-testid="drawing-magnification" className="tabular">
            {formatMagnification(1)}
          </span>
        </p>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom out"
          onClick={() => zoom(1 / ZOOM_STEP)}
        >
          <ZoomOut />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => zoom(ZOOM_STEP)}>
          <ZoomIn />
        </Button>
        {/* Brackets for framing the whole sheet, arrows for filling the screen: at the size an
            icon is actually drawn, two sets of corner brackets are one icon twice. */}
        <Button variant="ghost" size="icon" aria-label="Fit the whole drawing" onClick={fit}>
          <FitToFrame />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={expanded ? 'Leave full screen' : 'Full screen'}
          onClick={toggleFullScreen}
        >
          {expanded ? <Minimize2 /> : <Maximize2 />}
        </Button>
      </div>
    </div>
  );
}
