import sharp from 'sharp';

/**
 * **Where the position numbers on a drawing are, from pixel geometry alone** (ADR 0016, issue #33).
 *
 * The split is the point: *where* a number is comes from the ink, which is exact; *what* it says
 * comes from the model, one crop at a time, and the model is never asked for a coordinate. This
 * finds everything the size and shape of a printed position number — most of it is, some of it is
 * a bolt or a washer the model then says is not — and leaves out what lies in the margin or in a
 * ruled cell of the title block, which holds numbers that are not Positions.
 *
 * The sizes are for pages rendered at 200 dpi, as the read command renders them.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Candidate extends Box {
  /** Counting from 1, in reading order, so a crop can be named to the model and its answer matched. */
  id: number;
}

export interface FoundNumbers {
  width: number;
  height: number;
  candidates: Candidate[];
}

/** One candidate as the model is shown it: the ink around it, the candidate boxed in red. */
export interface NumberCrop {
  id: number;
  /** PNG. */
  image: Buffer;
  /** Where on the drawing it was cut from, in pixels. Never sent to the model. */
  at: Box;
}

/** A digit on a 200 dpi sheet, in pixels. */
const GLYPH_HEIGHT = { min: 15, max: 34 };
const GLYPH_WIDTH = { min: 3, max: 26 };
/** A digit is mostly stroke; a washer drawn as a thin ring is mostly hole. */
const GLYPH_INK = 0.18;
/**
 * Digits of one number stand closer than this fraction of their height. "81 82 83" printed in a
 * row stand further apart, and must come out as three candidates rather than one.
 */
const DIGIT_GAP = 0.3;
/** Two or three digits whose ink touches are one blob, wider than a digit and this much inkier. */
const MERGED_INK = 0.25;
const MERGED_WIDTH_TO_HEIGHT = 2.6;
/** Darker than this, out of 255, is ink. */
const INK = 140;
/** A candidate whose centre is this close to an edge, as a fraction of the sheet, is in the margin. */
const MARGIN = 0.025;
/**
 * How far, in its own heights, a ruled cell's sides may stand from a number written in it: a
 * title block's cells are short, and wide enough for a label beside the number.
 */
const CELL_REACH = { above: 3, across: 10 };
/** How much of a rule's length may be missing to the scan and still count as one line. */
const RULE_GAPS = 0.1;

export async function findNumbers(png: Buffer): Promise<FoundNumbers> {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const ink = new Uint8Array(width * height);
  for (let index = 0; index < ink.length; index += 1) {
    ink[index] = (data[index * info.channels] as number) < INK ? 1 : 0;
  }

  const blobs = componentsOf(ink, width, height);
  const grouped = groupedDigits(blobs.filter(isGlyph));
  const merged = blobs.filter(
    (blob) => isMergedDigits(blob) && !grouped.some((group) => overlaps(group, blob)),
  );
  const page = { ink, width, height };
  const kept = [...grouped, ...merged].filter(
    (box) => !inMargin(box, width, height) && !inRuledCell(page, box),
  );

  const readingOrder = kept.toSorted(
    (a, b) => Math.floor(a.y / 60) - Math.floor(b.y / 60) || a.x - b.x,
  );
  return {
    width,
    height,
    candidates: readingOrder.map((box, index) => ({ id: index + 1, ...boxOf(box) })),
  };
}

/** Each candidate cut out with enough of the drawing round it to tell a "1" from a bolt shank. */
export async function cropsOf(png: Buffer, found: FoundNumbers): Promise<NumberCrop[]> {
  const PAD = 22;
  const TALL = 120;
  // Decoded once: a drawing holds a few hundred candidates.
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const crops: NumberCrop[] = [];
  for (const candidate of found.candidates) {
    const left = Math.max(0, candidate.x - PAD);
    const top = Math.max(0, candidate.y - PAD);
    const width = Math.min(info.width, candidate.x + candidate.w + PAD) - left;
    const height = Math.min(info.height, candidate.y + candidate.h + PAD) - top;
    const pixels = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const grey = data[((top + y) * info.width + left + x) * info.channels] as number;
        pixels.fill(grey, (y * width + x) * 3, (y * width + x) * 3 + 3);
      }
    }
    outline(pixels, width, height, 3, {
      x: candidate.x - left - 4,
      y: candidate.y - top - 4,
      w: candidate.w + 8,
      h: candidate.h + 8,
    });
    const image = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .resize({ height: TALL })
      .png()
      .toBuffer();
    crops.push({ id: candidate.id, image, at: boxOf(candidate) });
  }
  return crops;
}

interface Blob extends Box {
  area: number;
}

/** Every connected piece of ink, eight ways connected, as its bounding box and how much ink. */
function componentsOf(ink: Uint8Array, width: number, height: number): Blob[] {
  const labels = new Int32Array(width * height).fill(-1);
  const blobs: Blob[] = [];
  const stack: number[] = [];

  for (let start = 0; start < ink.length; start += 1) {
    if (ink[start] === 0 || labels[start] !== -1) {
      continue;
    }
    const label = blobs.length;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    let area = 0;
    labels[start] = label;
    stack.push(start);
    while (stack.length > 0) {
      const at = stack.pop() as number;
      const x = at % width;
      const y = (at - x) / width;
      area += 1;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) {
          continue;
        }
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) {
            continue;
          }
          const next = ny * width + nx;
          if (ink[next] === 1 && labels[next] === -1) {
            labels[next] = label;
            stack.push(next);
          }
        }
      }
    }
    blobs.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, area });
  }
  return blobs;
}

function isGlyph(blob: Blob): boolean {
  return (
    within(blob.h, GLYPH_HEIGHT) &&
    within(blob.w, GLYPH_WIDTH) &&
    blob.area >= GLYPH_INK * blob.w * blob.h
  );
}

function isMergedDigits(blob: Blob): boolean {
  return (
    within(blob.h, GLYPH_HEIGHT) &&
    blob.w > GLYPH_WIDTH.max &&
    blob.w <= MERGED_WIDTH_TO_HEIGHT * blob.h &&
    blob.area >= MERGED_INK * blob.w * blob.h
  );
}

/**
 * Glyphs standing side by side on one line, as one candidate number. More than three is lettering
 * — a word, a code — and no position number.
 */
function groupedDigits(glyphs: Blob[]): Box[] {
  const groups: Blob[][] = [];
  for (const glyph of glyphs.toSorted((a, b) => a.x - b.x)) {
    const group = groups.find((members) => {
      const last = members.at(-1) as Blob;
      const overlap = Math.min(last.y + last.h, glyph.y + glyph.h) - Math.max(last.y, glyph.y);
      const gap = glyph.x - (last.x + last.w);
      return (
        Math.abs(last.h - glyph.h) <= 6 &&
        overlap > 0.7 * Math.min(last.h, glyph.h) &&
        gap >= -2 &&
        gap <= DIGIT_GAP * last.h
      );
    });
    if (group) {
      group.push(glyph);
    } else {
      groups.push([glyph]);
    }
  }
  return groups.filter((members) => members.length <= 3).map(boundsOf);
}

function inMargin(box: Box, width: number, height: number): boolean {
  const cx = (box.x + box.w / 2) / width;
  const cy = (box.y + box.h / 2) / height;
  return cx < MARGIN || cx > 1 - MARGIN || cy < MARGIN || cy > 1 - MARGIN;
}

interface Page {
  ink: Uint8Array;
  width: number;
  height: number;
}

/**
 * Whether ruled lines close the candidate in on all four sides, near it — a cell of the title
 * block, where *Tavola N°*, *Foglio N°* and the factory's dates are written. A position number on
 * the drawing stands in open space: a leader line runs to it from one side, never a box round it.
 */
function inRuledCell(page: Page, box: Box): boolean {
  // A rule is longer than what it rules off: well past the number either way.
  const across = { from: box.x - 2 * box.h, to: box.x + box.w + 2 * box.h };
  const down = { from: box.y - box.h / 2, to: box.y + box.h + box.h / 2 };
  const ruleAt = (line: number, horizontal: boolean) =>
    isRule(page, line, horizontal ? across : down, horizontal);
  const nearest = (from: number, step: number, horizontal: boolean) => {
    const reach = (horizontal ? CELL_REACH.above : CELL_REACH.across) * box.h;
    for (let distance = 2; distance <= reach; distance += 1) {
      if (ruleAt(from + step * distance, horizontal)) {
        return true;
      }
    }
    return false;
  };
  return (
    nearest(box.y, -1, true) &&
    nearest(box.y + box.h - 1, 1, true) &&
    nearest(box.x, -1, false) &&
    nearest(box.x + box.w - 1, 1, false)
  );
}

/**
 * A line of ink along row (or column) `line` across the whole span, allowing for a scan's slight
 * skew — a pixel either side — and for a few pixels the scan lost.
 */
function isRule(
  page: Page,
  line: number,
  span: { from: number; to: number },
  horizontal: boolean,
): boolean {
  const lineLength = horizontal ? page.height : page.width;
  const spanLength = horizontal ? page.width : page.height;
  if (line < 1 || line >= lineLength - 1) {
    return false;
  }
  const from = Math.max(0, Math.round(span.from));
  const to = Math.min(spanLength - 1, Math.round(span.to));
  if (to - from < 1) {
    return false;
  }
  let missing = 0;
  for (let along = from; along <= to; along += 1) {
    let found = false;
    for (let offset = -1; offset <= 1 && !found; offset += 1) {
      const index = horizontal
        ? (line + offset) * page.width + along
        : along * page.width + line + offset;
      found = page.ink[index] === 1;
    }
    if (!found) {
      missing += 1;
      if (missing > RULE_GAPS * (to - from + 1)) {
        return false;
      }
    }
  }
  return true;
}

/** A red box drawn into raw pixels, so the model knows which ink in the crop it is asked about. */
function outline(data: Buffer, width: number, height: number, channels: number, box: Box): void {
  const paint = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }
    const at = (y * width + x) * channels;
    data[at] = 220;
    data[at + 1] = 60;
    data[at + 2] = 40;
  };
  for (let x = box.x; x < box.x + box.w; x += 1) {
    paint(x, box.y);
    paint(x, box.y + box.h - 1);
  }
  for (let y = box.y; y < box.y + box.h; y += 1) {
    paint(box.x, y);
    paint(box.x + box.w - 1, y);
  }
}

function boundsOf(boxes: Box[]): Box {
  const x0 = Math.min(...boxes.map((box) => box.x));
  const y0 = Math.min(...boxes.map((box) => box.y));
  const x1 = Math.max(...boxes.map((box) => box.x + box.w));
  const y1 = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function boxOf({ x, y, w, h }: Box): Box {
  return { x, y, w, h };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

function within(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value <= range.max;
}
