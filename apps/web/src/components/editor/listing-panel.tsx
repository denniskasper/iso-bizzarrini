import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ListingCorrection } from '@/components/editor/listing-correction';
import { PartCorrection } from '@/components/editor/part-correction';
import { PartLookup } from '@/components/editor/part-lookup';
import { ListingFields } from '@/components/editor/listing-fields';
import { NO_PART, PartFields } from '@/components/editor/part-fields';
import { PartRecordEditor } from '@/components/editor/part-record-editor';
import { PhotographEditor } from '@/components/editor/photograph-editor';
import { Button } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import {
  ApiError,
  api,
  type CatalogNumberConflict,
  type NewPartRequest,
  type Part,
  type PartListing,
  type Position,
} from '@/lib/api';
import { usePositionListings, useRereadListings } from '@/lib/parts';

/**
 * Recording what sits at a number, and correcting it (stories 101–105, and ticket 25).
 *
 * **The Catalog Number collision is the feature and not the error path.** An Editor who types a
 * number the archive already holds is being told they are describing something it already has,
 * and the refusal arrives carrying that Part so they can list it here in one press instead of
 * creating a second copy of the same washer. Merge or correct: there is no third way past it,
 * because the third way is how a parts archive ends up with two of everything (ADR 0001).
 *
 * **Four different things can be worked on from here, and they are named apart** — because they
 * reach different distances and confusing them is how work goes missing:
 *
 * - *the part* changes the Part, and therefore every sheet it is listed on;
 * - *its photographs* likewise: a picture is of the component, not of its appearance on a sheet;
 * - *where it sits* changes this drawing's number, count and drawn flag, and nothing else;
 * - *removing it from this position* takes it off this sheet and leaves the Part alone.
 *
 * That last one is why the button no longer says "Remove". A Listing and a Part are different
 * things to remove, one of them is recoverable in a press and the other takes an evening's work
 * off drawings nobody is looking at, and a button that did not say which was a trap.
 */

/** Which of a listed Part's panels is open, if any. One thing at a time, deliberately. */
type Working =
  | { kind: 'part'; partId: string; offered?: NewPartRequest }
  | { kind: 'photographs'; partId: string }
  | { kind: 'record'; partId: string }
  | { kind: 'where'; listingId: string };

export function ListingPanel({
  tavolaId,
  position,
  positions,
}: {
  tavolaId: string;
  /** The number being worked on. There is nothing to record until one has been chosen. */
  position: Position;
  /** Every number on the sheet, so a Listing recorded against the wrong one can be moved. */
  positions: Position[];
}) {
  /** Which of the two ways of adding something is open: describing one, or finding one. */
  const [adding, setAdding] = useState<'record' | 'find' | null>(null);
  const [working, setWorking] = useState<Working | null>(null);
  const [part, setPart] = useState(NO_PART);
  const [quantity, setQuantity] = useState('');
  const [drawn, setDrawn] = useState(true);

  const listings = usePositionListings(position.id);
  const refresh = useRereadListings(tavolaId, position.id);

  /** The two fields the form beside the Part's own carries, as the archive takes them. */
  const asTyped = () => ({
    quantityPerCar: quantity === '' ? null : Number(quantity),
    drawn,
  });

  /** Opening any one panel closes whatever else was half-open. */
  const work = (next: Working | null) => {
    setAdding(null);
    setWorking(next);
  };

  /**
   * **What the count and the flag are is the caller's to say**, and that is not fussiness.
   *
   * Two of the three ways in have those boxes on the screen — describing a Part, and merging into
   * one after typing its number — so what the Editor typed is what is recorded. The third is the
   * lookup, which has no such boxes: reading them off a form nobody can see would record a
   * quantity that was never typed, so a Part listed from there arrives with none, and setting it
   * is one press on the panel that exists for exactly that.
   */
  const create = useMutation({
    mutationFn: (listing: {
      partId?: string;
      part?: NewPartRequest;
      quantityPerCar: number | null;
      drawn: boolean;
      thenCorrect?: boolean;
    }) =>
      api.createListing(tavolaId, {
        positionId: position.id,
        quantityPerCar: listing.quantityPerCar,
        drawn: listing.drawn,
        ...(listing.partId ? { partId: listing.partId } : { part: listing.part }),
      }),
    onSuccess: async (_result, listing) => {
      const typed = part;
      setPart(NO_PART);
      setQuantity('');
      setAdding(null);
      await refresh();

      /**
       * **The merge stops being a dead end here.** Before this, pressing "List that part here"
       * recorded the Listing and threw away everything else the Editor had written — the
       * description, the dimensions, the transcribed catalog note. Now it hands them into
       * correcting the Part they merged into, with what they typed offered field by field.
       * Offered, not applied: the archive cannot know whose description is the better one.
       */
      if (listing.thenCorrect && listing.partId) {
        setWorking({ kind: 'part', partId: listing.partId, offered: typed });
      }
    },
  });

  const remove = useMutation({
    mutationFn: (listingId: string) => api.removeListing(listingId),
    onSuccess: async () => {
      setWorking(null);
      await refresh();
    },
  });

  const clash = catalogNumberClash(create.error);
  const listedHere = listings.data?.listings ?? [];
  /**
   * A Part being corrected that is **not** listed at this number — which is how an orphan is
   * reached. It has no row to open a panel under, because having no row anywhere is the whole of
   * what is wrong with it, so the panel stands on its own below the sheet's own listings.
   */
  const loose =
    working?.kind === 'part' && !listedHere.some((listing) => listing.part.id === working.partId)
      ? working
      : null;

  return (
    <section aria-labelledby="listings" className="editor-panel registration-mark animate-rise">
      {/*
       * Named for the question rather than for the entity, and deliberately without the word
       * "position" in it: the panel beside the drawing is *the* Position on this screen, and two
       * regions a screen reader announces as "Position…" would be one thing said twice.
       */}
      <h2 id="listings" className="label">
        What sits at <span className="tabular">{position.number}</span>
      </h2>

      {/* What is already here, with a way back out of every mistake that can be made in it. */}
      {listedHere.length > 0 && (
        <ul className="mt-6 flex flex-col border-t border-line">
          {listedHere.map((listing) => (
            <Listed
              key={listing.id}
              tavolaId={tavolaId}
              listing={listing}
              at={position}
              positions={positions}
              working={working}
              busy={remove.isPending}
              onWork={work}
              onRemove={() => remove.mutate(listing.id)}
            />
          ))}
        </ul>
      )}

      {remove.isError && <Refusal>{remove.error.message}</Refusal>}

      {adding === null ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => {
              setWorking(null);
              setAdding('record');
            }}
          >
            Record a part here
          </Button>
          {/*
           * **The other half of story 103, and the one ticket 06 could not reach.** A part used
           * on six drawings stays one part, so listing it again names it — and until this
           * existed, the only thing that could name an existing Part was a Catalog Number
           * collision, which a part with no number can never have.
           */}
          <Button
            variant="ghost"
            onClick={() => {
              setWorking(null);
              setAdding('find');
            }}
          >
            List a part the archive already has
          </Button>
        </div>
      ) : adding === 'find' ? (
        <>
          <PartLookup
            busy={create.isPending}
            refusal={create.isError ? create.error.message : null}
            // No count and drawn by default: this screen shows neither, so neither is invented.
            onList={(partId) => create.mutate({ partId, quantityPerCar: null, drawn: true })}
            onCorrect={(partId) => work({ kind: 'part', partId })}
          />
          <div className="mt-6">
            <Button variant="ghost" onClick={() => setAdding(null)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <form
          className="mt-8 flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({ part, ...asTyped() });
          }}
        >
          <PartFields part={part} onChange={setPart} />

          <div className="grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
            <ListingFields
              quantity={quantity}
              drawn={drawn}
              onQuantity={setQuantity}
              onDrawn={setDrawn}
              quantityHint="How many are fitted here. The same part may take a different number on another drawing."
            />
          </div>

          {clash ? (
            <AlreadyRecorded
              part={clash}
              busy={create.isPending}
              // The count and the flag are on the form the Editor just filled in, so they hold.
              onMerge={() => create.mutate({ partId: clash.id, ...asTyped(), thenCorrect: true })}
              onCorrect={() => create.reset()}
            />
          ) : (
            create.isError && <Refusal>{create.error.message}</Refusal>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={create.isPending}>
              {create.isPending ? 'Recording…' : 'Record this part'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {loose && (
        <PartCorrection
          partId={loose.partId}
          offered={loose.offered}
          onDone={() => setWorking(null)}
        />
      )}
    </section>
  );
}

/**
 * One thing listed at this number, with the three different corrections it can take.
 *
 * **Opened one at a time, and deliberately not always open.** A Position carrying two
 * alternatives and three fixings is five Parts, each with three lists and a form apiece; laid out
 * at once that is a page an Editor scrolls past rather than works in.
 */
function Listed({
  tavolaId,
  listing,
  at,
  positions,
  working,
  busy,
  onWork,
  onRemove,
}: {
  tavolaId: string;
  listing: PartListing;
  at: Position;
  positions: Position[];
  working: Working | null;
  busy: boolean;
  onWork: (next: Working | null) => void;
  onRemove: () => void;
}) {
  /** Whether this row's panel of that kind is the one open — this row's, not another's. */
  const open = (kind: Working['kind']): boolean => {
    if (!working) {
      return false;
    }
    if (working.kind === 'where') {
      return kind === 'where' && working.listingId === listing.id;
    }
    return working.kind === kind && working.partId === listing.part.id;
  };

  /** A button that opens one of this row's panels, or closes it if it is the one already open. */
  const toggle = (kind: Working['kind'], label: string, opened: string) => (
    <Button
      variant="ghost"
      aria-expanded={open(kind)}
      onClick={() =>
        onWork(
          open(kind)
            ? null
            : kind === 'where'
              ? { kind: 'where', listingId: listing.id }
              : { kind, partId: listing.part.id },
        )
      }
    >
      {open(kind) ? opened : label}
    </Button>
  );

  return (
    <li className="border-b border-line py-3" data-testid="listed-row">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="text-pretty">
          {listing.part.nameEn ?? listing.part.nameIt}
          {listing.part.catalogNumber !== null && (
            <span className="tabular ml-4 text-sm text-muted">{listing.part.catalogNumber}</span>
          )}
          <span className="tag ml-4">
            {listing.drawn ? 'Drawn' : 'Not drawn'}
            {listing.quantityPerCar !== null && (
              <span className="tabular"> · ×{listing.quantityPerCar}</span>
            )}
          </span>
        </p>
        <span className="flex flex-wrap items-center gap-1">
          {toggle('part', 'Correct the part', 'Done with the part')}
          {toggle('photographs', 'Photographs', 'Done with photographs')}
          {toggle('where', 'Where it sits', 'Done with where it sits')}
          {toggle('record', 'Fits, equivalents, sources', 'Done with this part')}
          {/*
           * **Named for what it removes.** This takes the Part off this number and leaves
           * the Part alone — it may well be listed on five other drawings, and removing one
           * appearance is not removing the thing. Removing the thing is inside "Correct the
           * part", where the archive can refuse it while anything still lists it.
           */}
          <Button variant="ghost" disabled={busy} onClick={onRemove}>
            Remove from this position
          </Button>
        </span>
      </div>

      {open('part') && (
        <PartCorrection
          partId={listing.part.id}
          offered={working?.kind === 'part' ? working.offered : undefined}
          onDone={() => onWork(null)}
        />
      )}
      {open('photographs') && <PhotographEditor part={listing.part} />}
      {open('where') && (
        <ListingCorrection
          tavolaId={tavolaId}
          listing={listing}
          at={at}
          positions={positions}
          onDone={() => onWork(null)}
        />
      )}
      {open('record') && <PartRecordEditor part={listing.part} />}
    </li>
  );
}

/**
 * The merge-or-correct fork, and there is deliberately no way past it that records a second
 * Part. Either this Position gets the Part the archive already has, or the number typed was
 * wrong and the Editor fixes it — those are the only two things that can be true.
 *
 * **Merging is no longer a dead end.** Listing that Part here also opens it for correcting, with
 * everything the Editor had typed offered field by field: two people describing one Part
 * usually each know something, and the press that reconciles them should not be the press that
 * throws one of them away.
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
      <h3 className="label">That number is already recorded</h3>
      <p className="mt-3 max-w-measure text-pretty">
        <span className="tabular">{part.catalogNumber}</span> belongs to{' '}
        <strong className="font-semibold">{part.nameEn ?? part.nameIt}</strong>. The same part on
        two drawings stays one part, so list that one here — or correct the number if this is a
        different part. What you have typed is kept, and offered against that part's own fields.
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
