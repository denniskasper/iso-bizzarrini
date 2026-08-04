import { useMemo } from 'react';
import type { Position, TavolaListing } from '@/lib/api';
import { useTavolaListings } from '@/lib/parts';

/**
 * **What is left to do on one sheet**, worked out from the sheet and the index already on screen.
 *
 * Marking a Tavola up and finding out what sits at each number are separate evenings' work
 * (ticket 05), and nothing kills that work faster than not knowing where it stopped. This is the
 * answer to "where did I get to", and it costs no request: the drawing arrives with its numbers
 * and the index beside it arrives with what is listed, and between them they already say
 * everything below. A Model's sixty sheets are a different question and are counted in the
 * database, at `GET /api/models/:modelId/progress`.
 *
 * **Marked and listed are two independent facts, and neither is a stage of the other.** A number
 * the catalog prints that the drawing does not show is *finished* with no Mark on it, so nothing
 * here calls an unmarked Position undone — it reports which numbers have no circle, and an Editor
 * who has the sheet in front of them knows which of those the factory never drew.
 */

/**
 * A sheet's tally: the three counts, and the numbers behind two of them.
 *
 * Named for what it is rather than for the panel that prints it, because the panel is called
 * something else — a lesson from ticket 06, where a function and a component differing only in
 * case had to be told apart by whoever read either.
 */
export interface SheetTally {
  /** Every number recorded on the sheet. */
  positions: number;
  marked: number;
  listed: number;
  /** The numbers with no circle on the drawing, in the sheet's own order. */
  unmarked: Position[];
  /** The numbers with nothing recorded at them — the gaps a member sees too. */
  unlisted: Position[];
}

/**
 * The counts and the two lists, from the sheet's Positions and the sheet's own index.
 *
 * Both lists keep the order they arrived in, which is the catalog's — decided by the archive
 * under the database's own collation and never re-sorted here.
 */
export function tallyOf(positions: Position[], listings: TavolaListing[]): SheetTally {
  // A Listing at no number at all is a Part the catalog names on this sheet that nobody has
  // placed. It answers no number, so it cannot make one of them answered.
  const answered = new Set(
    listings.flatMap((listing) => (listing.positionId === null ? [] : [listing.positionId])),
  );

  const unmarked = positions.filter((position) => position.marks.length === 0);
  const unlisted = positions.filter((position) => !answered.has(position.id));

  return {
    positions: positions.length,
    marked: positions.length - unmarked.length,
    listed: positions.length - unlisted.length,
    unmarked,
    unlisted,
  };
}

/**
 * Where the sheet on screen has got to, and whether the archive has said yet.
 *
 * The three travel together because they are one answer in three states, and everything that
 * reads them reads all three: a panel that printed the tally without knowing whether it had
 * arrived would print zeroes at a sheet it had not read.
 */
export interface SheetProgress {
  /**
   * `null` until the index has arrived. **Half a summary is worse than none**: the numbers on the
   * sheet are known immediately, but "nothing is recorded at 4" is the one claim this exists to
   * make and it cannot be made before the index says so.
   */
  tally: SheetTally | null;
  isPending: boolean;
  error: Error | null;
}

/**
 * **Read once, by the page, and handed to both the things that need it** — the panel that prints
 * it and the drawing that lights the gaps up. Two components reading it separately would compute
 * the same answer twice against whatever each of them happened to be holding, and a panel saying
 * *one number has nothing recorded* beside a drawing lighting two circles is the screen
 * disagreeing with itself.
 *
 * It is the same request the index beside the drawing has already made, so in practice the answer
 * is here before this is asked.
 */
export function useSheetProgress(tavolaId: string, positions: Position[]): SheetProgress {
  const { data, isPending, error } = useTavolaListings(tavolaId);

  const tally = useMemo(() => (data ? tallyOf(positions, data.listings) : null), [positions, data]);

  return { tally, isPending, error };
}
