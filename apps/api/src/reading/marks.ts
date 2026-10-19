import type { Candidate, FoundNumbers } from './find-numbers.js';
import type { ReadListing } from './interpret.js';
import type { NumberReading, Turn } from './reading-method.js';

/**
 * **The Marks a drawing's numbers propose, and where they and the table disagree** (issue #33).
 *
 * Where each number is comes from the ink (`find-numbers.ts`) and what it says from the model; this
 * joins the two. A Mark is in fractions of the drawing (ADR 0013), `0` at its left and top edges
 * and `1` at its right and bottom, so it stays where it is at any resolution the Scan is shown at.
 */
export interface ProposedMark {
  /** The position number as read. */
  position: string;
  x: number;
  y: number;
  /** The model read it as best it could, or it was put back together from two parts. */
  unsure: boolean;
}

export interface MarkDoubt {
  position: string;
  reason: string;
}

/**
 * `turned` is how far clockwise the drawing was turned from its Scan for the numbers to be found
 * upright (issue #72): each Mark is turned back, to stand where it does on the Scan.
 */
export function proposeMarks(
  found: FoundNumbers,
  readings: NumberReading[],
  turned: Turn = 0,
): ProposedMark[] {
  const byId = new Map(readings.map((reading) => [reading.id, reading]));
  const at = (x: number, y: number) => onScan(x / found.width, y / found.height, turned);
  const marks: ProposedMark[] = [];

  // A box that caught half a number would put a Mark for the wrong Position on the sheet: two
  // halves standing side by side are one number the finder split, put back together.
  const halves = found.candidates
    .filter((candidate) => byId.get(candidate.id)?.partial && byId.get(candidate.id)?.number)
    .toSorted((a, b) => a.x - b.x);
  const runs: Candidate[][] = [];
  for (const half of halves) {
    const run = runs.find((pieces) => {
      const last = pieces.at(-1) as Candidate;
      const gap = half.x - (last.x + last.w);
      return gap >= -2 && gap <= 0.6 * last.h && Math.abs(last.y - half.y) <= 0.4 * last.h;
    });
    if (run) {
      run.push(half);
    } else {
      runs.push([half]);
    }
  }
  for (const run of runs.filter((pieces) => pieces.length > 1)) {
    const first = run[0] as Candidate;
    const last = run.at(-1) as Candidate;
    const digits = run.map((piece) => digitsOf(byId.get(piece.id)?.number)).join('');
    if (digits !== '') {
      marks.push({
        position: digits,
        ...at((first.x + last.x + last.w) / 2, first.y + first.h / 2),
        unsure: true,
      });
    }
  }

  for (const candidate of found.candidates) {
    const reading = byId.get(candidate.id);
    if (!reading?.number || reading.partial) {
      continue;
    }
    // Two numbers the finder took for one, "81 82", each at its share of the box.
    const numbers = reading.number.match(/\d+/g) ?? [];
    for (const [index, number] of numbers.entries()) {
      marks.push({
        position: number,
        ...at(
          candidate.x + (candidate.w * (index + 0.5)) / numbers.length,
          candidate.y + candidate.h / 2,
        ),
        unsure: reading.unsure,
      });
    }
  }

  return marks.toSorted((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Every Position the table lists that received no Mark, and every Mark whose number is in no row
 * of the table — each is either a number the reading missed or misread, or a row it did.
 */
export function markDoubts(listings: ReadListing[], marks: ProposedMark[]): MarkDoubt[] {
  const listed = new Set(listings.map((listing) => listing.position).filter(Boolean));
  const marked = new Set(marks.map((mark) => mark.position));
  const byNumber = (a: string, b: string) =>
    a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

  return [
    ...[...listed]
      .filter((position) => !marked.has(position))
      .toSorted(byNumber)
      .map((position) => ({
        position,
        reason: `Position ${position} is in the table, and no Mark for it was found on the drawing.`,
      })),
    ...[...marked]
      .filter((position) => !listed.has(position))
      .toSorted(byNumber)
      .map((position) => ({
        position,
        reason: `A Mark for ${position} is on the drawing, and no row of the table has Position ${position}.`,
      })),
  ];
}

/** A point on the drawing turned `turned` clockwise, where it is on the drawing before the turn. */
function onScan(x: number, y: number, turned: Turn): { x: number; y: number } {
  switch (turned) {
    case 90:
      return { x: y, y: 1 - x };
    case 180:
      return { x: 1 - x, y: 1 - y };
    case 270:
      return { x: 1 - y, y: x };
    default:
      return { x, y };
  }
}

function digitsOf(number: string | null | undefined): string {
  return (number ?? '').replace(/\D/g, '');
}
