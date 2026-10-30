import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Mark, Position, Sheet, SubAssembly, TavolaResponse } from '@/lib/api';

/**
 * The sheet: finding a number on it, reading what belongs with that number, and keeping what the
 * archive last said about the whole of it.
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

/**
 * The named Sub-assembly a number sits in, if any.
 *
 * **A number in none gets nothing back**, which is the whole point of the null: it does not fall
 * through to the sheet, and a screen reading this has nothing to print rather than two hundred
 * numbers to print.
 */
export function subAssemblyOf(sheet: Sheet, position: Position | null): SubAssembly | null {
  if (!position?.subAssemblyId) {
    return null;
  }
  return sheet.subAssemblies.find((one) => one.id === position.subAssemblyId) ?? null;
}

/**
 * The numbers in a Sub-assembly, in the sheet's own order.
 *
 * Read off the sheet's Positions rather than carried on the Sub-assembly, because membership is
 * one fact and it lives on the Position. The same list written on the Sub-assembly as well would
 * be the same fact twice, free to disagree the moment a number moves.
 */
export function positionsIn(sheet: Sheet, subAssemblyId: string): Position[] {
  return sheet.positions.filter((position) => position.subAssemblyId === subAssemblyId);
}

/** The numbers a Position is linked to, resolved against the sheet they are all on. */
export function relatedTo(
  sheet: Sheet,
  position: Position | null,
): { linkId: string; position: Position }[] {
  const byId = new Map(sheet.positions.map((one) => [one.id, one]));

  return (position?.related ?? []).flatMap((link) => {
    const other = byId.get(link.positionId);
    return other ? [{ linkId: link.id, position: other }] : [];
  });
}

/**
 * **Every write answers with the sheet, so the answer is written straight into the cache** rather
 * than used to invalidate it.
 *
 * An Editor placing two hundred circles pays one round trip a circle; re-reading the Tavola after
 * each one would double that, and re-fetch a drawing's worth of metadata to learn the one thing
 * the archive has just finished saying.
 *
 * It takes the sheet **whole** and not its Positions. Naming a Sub-assembly and linking two
 * numbers change more than the one number that was asked about — a link is symmetric and a
 * Sub-assembly stops existing when its last number leaves it — and a cache that kept the old
 * names beside the new Positions would be a panel naming one the archive no longer holds.
 */
export function useRecordSheet(tavolaId: string): (sheet: Sheet) => void {
  const queryClient = useQueryClient();

  return useCallback(
    (sheet: Sheet) => {
      queryClient.setQueryData<TavolaResponse>(['tavola', tavolaId], (current) =>
        current ? { ...current, ...sheet } : current,
      );
      // A Sub-assembly's page lists its numbers, which this write may just have changed — and
      // the sheet that came back does not carry what sits at them, so those pages are re-read.
      void queryClient.invalidateQueries({ queryKey: subAssemblyKey(tavolaId) });
    },
    [queryClient, tavolaId],
  );
}

/**
 * The cache key of a Sub-assembly's page, or of every one on a sheet when the id is left out —
 * which is what a write to the sheet's numbers has to re-read.
 */
export function subAssemblyKey(tavolaId: string, subAssemblyId?: string): string[] {
  return subAssemblyId === undefined
    ? ['sub-assembly', tavolaId]
    : ['sub-assembly', tavolaId, subAssemblyId];
}
