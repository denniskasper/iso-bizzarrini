/**
 * Where the drawing sits in the frame it is being read through.
 *
 * All of it is pure arithmetic on two rectangles, kept apart from the component that listens to
 * fingers and wheels, because these are the rules the viewer actually promises a member: the
 * whole sheet is what you start with, you can magnify a position number until you can read it,
 * and **the drawing never leaves the frame** — which is what "without losing track of where you
 * are" means in numbers.
 *
 * One coordinate system throughout: *image pixels* are the scan's own, and *frame pixels* are
 * CSS pixels inside the window the drawing is read through. `scale` converts between them.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * A drawing and the window it is being read through. The two are meaningless apart — every
 * answer below is "this drawing, in this frame" — so they travel as one thing rather than as a
 * pair of arguments every caller has to keep in the right order.
 */
export interface Stage {
  image: Size;
  frame: Size;
}

export interface Viewport {
  /** Frame pixels per image pixel. At `1` the scan is drawn at its own resolution. */
  scale: number;
  /** Where the image's top-left corner sits in the frame, in frame pixels. */
  x: number;
  y: number;
}

/** A rectangle of the drawing, as fractions of it — the same units a Mark is stored in. */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How far in a member may go: **one image pixel per frame pixel, or four times the fitted view,
 * whichever is further.**
 *
 * The first term is what makes a position number readable — at native resolution the smallest
 * mark the factory printed is drawn at the size it was scanned at, and no delivery format can
 * do better. The second is for a drawing that is small enough to nearly fit already, where
 * stopping at native resolution would be barely a zoom at all; magnifying past native blurs a
 * line but a faded number blown up is still a number, and a garage is not a gallery.
 */
const NATIVE_RESOLUTION = 1;
const FIT_MULTIPLE = 4;

/** The scale at which the whole sheet is on screen. The floor, and what `×1` means. */
function fitScale({ image, frame }: Stage): number {
  if (image.width <= 0 || image.height <= 0 || frame.width <= 0 || frame.height <= 0) {
    return 1;
  }
  return Math.min(frame.width / image.width, frame.height / image.height);
}

export function maxScale(stage: Stage): number {
  return Math.max(NATIVE_RESOLUTION, fitScale(stage) * FIT_MULTIPLE);
}

/** The whole drawing, centred. What a member gets every time a Tavola opens. */
export function fitted(stage: Stage): Viewport {
  return clamped({ scale: fitScale(stage), x: 0, y: 0 }, stage);
}

/**
 * The viewport, made legal.
 *
 * Zoom is held between the whole sheet and the magnification above. Position is held so that no
 * paper-less gap can appear at an edge: an axis the drawing overflows is pinned to its own
 * edges, and an axis it does not fill is centred rather than left wherever a gesture put it.
 * Everything below ends here, so there is exactly one place these rules are written.
 */
export function clamped(viewport: Viewport, stage: Stage): Viewport {
  const scale = between(viewport.scale, fitScale(stage), maxScale(stage));

  return {
    scale,
    x: alongAxis(viewport.x, stage.image.width * scale, stage.frame.width),
    y: alongAxis(viewport.y, stage.image.height * scale, stage.frame.height),
  };
}

function alongAxis(offset: number, extent: number, frame: number): number {
  if (extent <= frame) {
    return (frame - extent) / 2;
  }
  return Math.min(0, Math.max(frame - extent, offset));
}

export function panned(viewport: Viewport, by: Point, stage: Stage): Viewport {
  return clamped({ ...viewport, x: viewport.x + by.x, y: viewport.y + by.y }, stage);
}

/**
 * Zoom about a point the member is holding still — the pointer under a wheel, the midpoint
 * between two fingers. Whatever part of the drawing is under that point stays under it, which
 * is the difference between magnifying *this* number and magnifying the middle of the sheet.
 */
export function zoomedAbout(
  viewport: Viewport,
  anchor: Point,
  scale: number,
  stage: Stage,
): Viewport {
  const next = between(scale, fitScale(stage), maxScale(stage));
  const ratio = next / viewport.scale;

  return clamped(
    {
      scale: next,
      x: anchor.x - (anchor.x - viewport.x) * ratio,
      y: anchor.y - (anchor.y - viewport.y) * ratio,
    },
    stage,
  );
}

/** The same zoom, about the middle of the frame — what a button press means. */
export function zoomedBy(factor: number, viewport: Viewport, stage: Stage): Viewport {
  const middle = { x: stage.frame.width / 2, y: stage.frame.height / 2 };
  return zoomedAbout(viewport, middle, viewport.scale * factor, stage);
}

/** Put a fractional point of the drawing in the middle of the frame. */
export function centredOn(at: Point, viewport: Viewport, stage: Stage): Viewport {
  return clamped(
    {
      ...viewport,
      x: stage.frame.width / 2 - at.x * stage.image.width * viewport.scale,
      y: stage.frame.height / 2 - at.y * stage.image.height * viewport.scale,
    },
    stage,
  );
}

/**
 * Which part of the drawing is in the frame, as fractions of the drawing.
 *
 * This is what the navigator draws, and it is deliberately in fractional coordinates — the same
 * units ADR 0013 commits Marks to, so nothing here has to be revisited if the scan is ever
 * delivered as tiles instead.
 */
export function visibleRegion(viewport: Viewport, stage: Stage): Region {
  const drawn = {
    width: stage.image.width * viewport.scale,
    height: stage.image.height * viewport.scale,
  };

  const x = between(-viewport.x / drawn.width, 0, 1);
  const y = between(-viewport.y / drawn.height, 0, 1);

  return {
    x,
    y,
    width: Math.min(stage.frame.width / drawn.width, 1 - x),
    height: Math.min(stage.frame.height / drawn.height, 1 - y),
  };
}

/** The fractional point of the drawing at the middle of the frame — what a resize preserves. */
export function focusOf(viewport: Viewport, stage: Stage): Point {
  const region = visibleRegion(viewport, stage);
  return { x: region.x + region.width / 2, y: region.y + region.height / 2 };
}

/**
 * How far in the member is, counted from the whole sheet rather than from the scan's own
 * resolution: `×1` is the drawing as it opened, which is the only reading of "how far in am I"
 * that means anything to somebody holding a phone.
 */
export function magnification(viewport: Viewport, stage: Stage): number {
  return viewport.scale / fitScale(stage);
}

/** As it is written on the instrument. */
export function formatMagnification(times: number): string {
  return `×${times.toFixed(1)}`;
}

function between(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
