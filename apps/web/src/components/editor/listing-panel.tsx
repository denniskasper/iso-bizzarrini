import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Refusal, TextArea } from '@/components/ui/field';
import {
  ApiError,
  api,
  type CatalogNumberConflict,
  type NewPartRequest,
  type Part,
  type Position,
} from '@/lib/api';
import { usePositionListings, useRereadPosition } from '@/lib/parts';

/**
 * Recording what sits at a number (stories 101–105), on the panel an Editor opened deliberately
 * — below the drawing, ruled off from it, never over it.
 *
 * **The Catalog Number collision is the feature and not the error path.** An Editor who types a
 * number the archive already holds is being told they are describing something it already has,
 * and the refusal arrives carrying that Part so they can list it here in one press instead of
 * creating a second copy of the same washer. Merge or correct: there is no third way past it,
 * because the third way is how a parts archive ends up with two of everything (ADR 0001).
 */

const EMPTY: NewPartRequest = {
  nameEn: '',
  nameIt: '',
  catalogNumber: '',
  disegnoOrigine: '',
  description: '',
  dimensions: '',
  materialFinish: '',
  catalogNote: '',
  note: '',
};

export function ListingPanel({
  tavolaId,
  position,
}: {
  tavolaId: string;
  /** The number being worked on. There is nothing to record until one has been chosen. */
  position: Position;
}) {
  const [open, setOpen] = useState(false);
  const [part, setPart] = useState(EMPTY);
  const [quantity, setQuantity] = useState('');
  const [drawn, setDrawn] = useState(true);
  const drawnId = useId();

  const listings = usePositionListings(position.id);
  const refresh = useRereadPosition(position.id);

  const create = useMutation({
    mutationFn: (listing: { partId?: string; part?: NewPartRequest }) =>
      api.createListing(tavolaId, {
        positionId: position.id,
        quantityPerCar: quantity === '' ? null : Number(quantity),
        drawn,
        ...listing,
      }),
    onSuccess: async () => {
      setPart(EMPTY);
      setQuantity('');
      setOpen(false);
      await refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (listingId: string) => api.removeListing(listingId),
    onSuccess: refresh,
  });

  const set = (field: keyof NewPartRequest) => (event: { target: { value: string } }) =>
    setPart({ ...part, [field]: event.target.value });

  const clash = catalogNumberClash(create.error);

  return (
    <section aria-labelledby="listings" className="editor-panel registration-mark animate-rise">
      {/*
       * Named for the question rather than for the entity, and deliberately without the word
       * "position" in it: the panel beside the drawing is *the* Position on this screen, and two
       * regions a screen reader announces as "Position…" would be one thing said twice.
       */}
      <h2 id="listings" className="text-2xs text-muted uppercase">
        What sits at <span className="tabular">{position.number}</span>
      </h2>

      {/* What is already here, with a way back out of a mistake. Reading is the panel beside the
          drawing; this is the same Listings as an Editor's working list. */}
      {listings.data && listings.data.listings.length > 0 && (
        <ul className="mt-6 flex flex-col border-t border-line">
          {listings.data.listings.map((listing) => (
            <li
              key={listing.id}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line py-3"
            >
              <p className="text-pretty">
                {listing.part.nameEn ?? listing.part.nameIt}
                {listing.part.catalogNumber !== null && (
                  <span className="tabular ml-4 text-sm text-muted">
                    {listing.part.catalogNumber}
                  </span>
                )}
                <span className="ml-4 text-2xs text-faint uppercase">
                  {listing.drawn ? 'Drawn' : 'Not drawn'}
                  {listing.quantityPerCar !== null && (
                    <span className="tabular"> · ×{listing.quantityPerCar}</span>
                  )}
                </span>
              </p>
              <Button
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate(listing.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {remove.isError && <Refusal>{remove.error.message}</Refusal>}

      {!open ? (
        <div className="mt-6">
          <Button onClick={() => setOpen(true)}>Record a part here</Button>
        </div>
      ) : (
        <form
          className="mt-8 flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({ part });
          }}
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              label="Name (English)"
              hint="What a member reads. One of the two names is required."
              value={part.nameEn}
              onChange={set('nameEn')}
            />
            <Field
              label="Denominazione (Italian)"
              hint="As the catalog prints it."
              value={part.nameIt}
              onChange={set('nameIt')}
            />
            <Field
              label="Catalog number"
              mono
              hint="The catalog's first column. Leave it blank if the part has none — many have."
              value={part.catalogNumber}
              onChange={set('catalogNumber')}
            />
            <Field
              label="Disegno origine"
              mono
              hint="The original factory drawing number. Two parts may share one."
              value={part.disegnoOrigine}
              onChange={set('disegnoOrigine')}
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              label="Quantity per car"
              mono
              type="number"
              min={1}
              inputMode="numeric"
              hint="How many are fitted here. The same part may take a different number on another drawing."
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />

            {/*
             * The one field on this form that changes what a member is told to buy. Drawn Parts
             * at a Position are alternatives; undrawn ones are the fixings needed as well, so
             * this is written out in words rather than left as a flag to remember.
             */}
            <label
              htmlFor={drawnId}
              className="flex max-w-measure items-start gap-3 text-sm text-pretty text-muted"
            >
              <input
                id={drawnId}
                type="checkbox"
                data-testid="listing-drawn"
                checked={drawn}
                onChange={(event) => setDrawn(event.target.checked)}
                className="mt-1 size-5 accent-accent"
              />
              <span>
                The position's number points at this part. Clear it for a screw, washer or clip that
                shares the position but is not on the drawing.
              </span>
            </label>
          </div>

          <TextArea label="Description" value={part.description} onChange={set('description')} />

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Dimensions" mono value={part.dimensions} onChange={set('dimensions')} />
            <Field
              label="Material and finish"
              value={part.materialFinish}
              onChange={set('materialFinish')}
            />
          </div>

          <fieldset className="grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
            <legend className="sr-only">Notes</legend>
            <TextArea
              label="Catalog note"
              hint="Transcribed from the factory catalog, in its words. Nobody will improve it later."
              value={part.catalogNote}
              onChange={set('catalogNote')}
            />
            <TextArea
              label="The club's note"
              hint="What we have established. Kept apart from the factory's own text, always."
              value={part.note}
              onChange={set('note')}
            />
          </fieldset>

          {clash ? (
            <AlreadyRecorded
              part={clash}
              busy={create.isPending}
              onMerge={() => create.mutate({ partId: clash.id })}
              onCorrect={() => create.reset()}
            />
          ) : (
            create.isError && <Refusal>{create.error.message}</Refusal>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={create.isPending}>
              {create.isPending ? 'Recording…' : 'Record this part'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * The merge-or-correct fork, and there is deliberately no way past it that records a second
 * Part. Either this Position gets the Part the archive already has, or the number typed was
 * wrong and the Editor fixes it — those are the only two things that can be true.
 */
function AlreadyRecorded({
  part,
  busy,
  onMerge,
  onCorrect,
}: {
  part: Part;
  busy: boolean;
  onMerge: () => void;
  onCorrect: () => void;
}) {
  return (
    <div role="alert" className="border border-line-strong p-6" data-testid="catalog-number-clash">
      <h3 className="text-2xs text-muted uppercase">That number is already recorded</h3>
      <p className="mt-3 max-w-measure text-pretty">
        <span className="tabular">{part.catalogNumber}</span> belongs to{' '}
        <strong className="font-semibold">{part.nameEn ?? part.nameIt}</strong>. The same part on
        two drawings stays one part, so list that one here — or correct the number if this is a
        different part.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="primary" disabled={busy} onClick={onMerge}>
          List that part here
        </Button>
        <Button variant="outline" onClick={onCorrect}>
          Correct the number
        </Button>
      </div>
    </div>
  );
}

/** The Part a refused Catalog Number came back with, or nothing if the refusal was another one. */
function catalogNumberClash(error: unknown): Part | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null;
  }
  return (error.details as CatalogNumberConflict | undefined)?.part ?? null;
}
