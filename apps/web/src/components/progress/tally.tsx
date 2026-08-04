import { Refusal } from '@/components/ui/field';

/**
 * The two things both tallies say the same way — one for a sheet, one for a whole car.
 *
 * They are here rather than written out on each because they are one statement made twice: two
 * screens counting the same archive must not say *Counting…* in one place and something else in
 * the other, and a fraction set two ways is two screens quietly drifting apart (ticket 06 caught
 * the same thing in a query key).
 */

/** Whether the archive has answered yet. Neither screen may claim a count before it has. */
export function Counting({ isPending, error }: { isPending: boolean; error: Error | null }) {
  return (
    <>
      {isPending && <p className="mt-6 text-muted">Counting…</p>}
      {error && <Refusal>{error.message}</Refusal>}
    </>
  );
}

/**
 * A count out of the sheet it is a count of — **written as the catalog writes a fraction, and
 * never as a percentage.** Forty-seven numbers is a quantity of evenings; 68% is a claim about
 * how nearly finished something is, and these two counts are not that (see `SheetTally`).
 *
 * The denominator is the faint one because it is the part that does not change.
 */
export function Fraction({ of, outOf }: { of: number; outOf: number }) {
  return (
    <>
      {of}
      <span className="text-faint"> / {outOf}</span>
    </>
  );
}
