import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ListingFields } from '@/components/editor/listing-fields';
import { Button } from '@/components/ui/button';
import { Refusal, Select } from '@/components/ui/field';
import { api, type PartListing, type Position } from '@/lib/api';
import { useRereadMovedListing } from '@/lib/parts';

/**
 * Where a Part sits on **this** sheet: the number, how many are fitted there, and whether the
 * drawing shows it.
 *
 * **The narrow half of correcting, and the distinction is the point.** What the Part *is* is
 * true of it everywhere (ADR 0001); how many of them this drawing takes is true only here, which
 * is why the quantity lives on the Listing and the same washer is four on one sheet and two on
 * another. So this panel changes one sheet and says nothing about any other, and the panel that
 * corrects the Part says loudly that it changes all of them.
 *
 * Which Part it is is deliberately not on this form. A Listing that could be pointed at a
 * different Part would be a way of editing two records with one press, and the archive
 * refuses it at the wire.
 */
export function ListingCorrection({
  tavolaId,
  listing,
  at,
  positions,
  onDone,
}: {
  tavolaId: string;
  listing: PartListing;
  /**
   * The number it is at now — handed in rather than read off the Listing, because a `PartListing`
   * does not carry one. It is read *at* a Position, and carrying the number on it as well would
   * be the same fact in two places, free to disagree.
   */
  at: Position;
  /** Every number on this sheet — a Part transcribed against the wrong line has to move. */
  positions: Position[];
  onDone: () => void;
}) {
  const [positionId, setPositionId] = useState(at.id);
  const [quantity, setQuantity] = useState(
    listing.quantityPerCar === null ? '' : String(listing.quantityPerCar),
  );
  const [drawn, setDrawn] = useState(listing.drawn);
  const reread = useRereadMovedListing(tavolaId);

  const correct = useMutation({
    mutationFn: () =>
      api.correctListing(listing.id, {
        positionId: positionId === '' ? null : positionId,
        quantityPerCar: quantity === '' ? null : Number(quantity),
        drawn,
      }),
    onSuccess: async () => {
      // The sheet's index and **every** number on it, because this Listing may have left one and
      // arrived at another — and a browser holding what it read thirty seconds ago would go on
      // showing a Part at a number it is no longer at.
      await reread();
      onDone();
    },
  });

  return (
    <form
      className="mt-6 flex flex-col gap-6 border-t border-line pt-6"
      onSubmit={(event) => {
        event.preventDefault();
        correct.mutate();
      }}
    >
      <p className="max-w-measure text-sm text-pretty text-muted">
        Where this part sits on this drawing. It changes nothing on any other sheet{' '}
        <strong className="font-semibold">{listing.part.nameEn ?? listing.part.nameIt}</strong> is
        listed on.
      </p>

      <Select
        label="Position"
        mono
        className="sm:max-w-64"
        data-testid="listing-position"
        hint="The number the factory printed. A part the catalog names on this sheet may sit at none."
        value={positionId}
        onChange={(event) => setPositionId(event.target.value)}
      >
        {/* Not a number at all, which is a state the model has had since ticket 06 and the
            one a Position removed out from under a Listing leaves it in. */}
        <option value="">No number on this sheet</option>
        {positions.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.number}
          </option>
        ))}
      </Select>

      {/* The same two boxes the form that records a Part carries, in the same layout — they are
          the same two questions, and an Editor should not have to notice which screen they are on. */}
      <div className="grid gap-6 sm:grid-cols-2">
        <ListingFields
          quantity={quantity}
          drawn={drawn}
          onQuantity={setQuantity}
          onDrawn={setDrawn}
          quantityHint="How many are fitted here. Leave it blank where the catalog prints no count."
        />
      </div>

      {correct.isError && <Refusal>{correct.error.message}</Refusal>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={correct.isPending}>
          {correct.isPending ? 'Correcting…' : 'Correct where it sits'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
