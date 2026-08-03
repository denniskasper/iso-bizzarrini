import type { Mark, Position } from '@/lib/api';

/**
 * Finding a number a member already knows.
 *
 * **A Position number is an identifier, not a quantity** — `207`, `210 S`, `12 bis` — so nothing
 * here does arithmetic on one. What it does instead is forgive the two things that are typing
 * rather than identity: the case of a suffix, and the space in front of it. A member holding a
 * bracket stamped `210` has to reach `210 S` without knowing the sheet distinguishes a left from
 * a right (story 51), and somebody who types the whole thing has to reach it too.
 *
 * The same rule serves the link a member sends someone else, which is why it lives here rather
 * than in the field: `?position=210` and `?position=210%20S` open the same number, so a link
 * built from what somebody typed opens what they were looking at (story 52).
 */

/** What two printed numbers are compared by. Case and spacing are typing; the digits are not. */
function key(number: string): string {
  return number.toLowerCase().replace(/\s+/g, '');
}

/**
 * Every number on the sheet that a typed one could mean, **the exact match first** and the rest
 * in the order the factory printed them.
 *
 * Prefix rather than equality is the whole of story 51: `210` is a complete number to whoever
 * typed it and the beginning of one to the factory, and the archive is in no position to say
 * which was meant. So it offers both and lets the member point at one.
 */
export function positionsMatching(positions: Position[], typed: string): Position[] {
  const wanted = key(typed);
  if (wanted === '') {
    return [];
  }

  // Stable, so anything that is not an exact match keeps the catalog's own order — which is the
  // order these arrived in, decided by the archive and never re-sorted here.
  return positions
    .filter((position) => key(position.number).startsWith(wanted))
    .sort(
      (first, second) =>
        Number(key(first.number) !== wanted) - Number(key(second.number) !== wanted),
    );
}

/** The one a typed number means, or nothing — what a jump and a shared link both resolve to. */
export function positionMatching(positions: Position[], typed: string): Position | null {
  return positionsMatching(positions, typed)[0] ?? null;
}

/**
 * The next place on the sheet the same number is printed, wrapping round at the last.
 *
 * The factory printed one number wherever the part is used, so a Position with four circles is a
 * part fitted in four places — and selecting it again is how a member finds that out (story 48).
 * Wrapping rather than stopping is deliberate: the fourth of four is not a dead end, it is the
 * way back round to the first.
 */
export function markAfter(marks: Mark[], currentId: string | null): Mark | null {
  if (marks.length === 0) {
    return null;
  }
  const at = marks.findIndex((mark) => mark.id === currentId);
  return marks[(at + 1) % marks.length] ?? null;
}

/** Which circle is being read: the one chosen, or the first one down the sheet. */
export function markOn(position: Position, markId: string | null): Mark | null {
  return position.marks.find((mark) => mark.id === markId) ?? position.marks[0] ?? null;
}
