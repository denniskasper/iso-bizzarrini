import { useMutation } from '@tanstack/react-query';
import { useId, useImperativeHandle, useRef, type Ref } from 'react';
import { EnglishName } from '@/components/machine-translation';
import { usePartsJump } from '@/components/parts/parts-jump';
import { Refusal } from '@/components/ui/field';
import { besideTheDrawing } from '@/components/viewer/mark-card';
import { api, type Position, type TavolaListing } from '@/lib/api';
import { useRereadMovedListing, useTavolaListings } from '@/lib/parts';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

/**
 * The one way in from outside: **a circle read on the drawing brings its row into view** here, so
 * a member working down the list does not lose their place in it by reading from the sheet.
 */
export interface SheetIndex {
  show(positionId: string): void;
}

/**
 * **The facing page of a factory catalog**: the drawing on one side, its numbered table on the
 * other. That is what this is, and the form is borrowed rather than invented — anybody who has
 * had one of these open on a bench has read one.
 *
 * It is the other direction of travel (story 46). A member who knows what a part is *called* but
 * not where it is on the sheet works down the text until they find it, and selecting it takes the
 * drawing to the circle (story 47) — which is the same journey as clicking a circle to read the
 * part, made in reverse.
 *
 * **A number with nothing beside it is the third thing this list says** (story 45). "Not known"
 * and "not yet clicked" are entirely different answers to a member deciding whether to keep
 * looking, and until this list existed there was no way to tell them apart without clicking every
 * number on the sheet.
 */
export function TavolaParts({
  ref,
  tavolaId,
  positions,
  selectedPositionId,
  onSelect,
  head,
}: {
  ref?: Ref<SheetIndex>;
  tavolaId: string;
  /** The sheet's numbers, which arrive with the drawing and are its own order. */
  positions: Position[];
  selectedPositionId: string | null;
  /** Reading a number from the text, which takes the drawing to it. */
  onSelect: (position: Position) => void;
  /** The head of the facing page this list is on, which a long list jumps back up to. */
  head: HTMLElement | null;
}) {
  const section = useRef<HTMLElement>(null);
  const jump = usePartsJump(head, section);

  useImperativeHandle(
    ref,
    () => ({
      show(positionId) {
        const list = section.current;
        // Only where the list stands beside the drawing, which stays put as the page scrolls: on
        // a phone it is under the drawing, and scrolling would take the sheet from the hand on it.
        // And only while the list is what is being read — a member at the reading above it asked
        // to read the number there, not to be taken down the page away from it.
        if (!list || !besideTheDrawing()) {
          return;
        }
        const box = list.getBoundingClientRect();
        if (box.bottom <= 0 || box.top >= window.innerHeight) {
          return;
        }
        // A frame later, once the page has drawn what selecting the number changed.
        requestAnimationFrame(() => {
          const row = list.querySelector<HTMLElement>(
            `[data-position-id="${CSS.escape(positionId)}"]`,
          );
          // A row already in view leaves the list exactly where it is.
          if (!row || inView(row)) {
            return;
          }
          const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          row.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
          // The reading above the list fills in as what is at the number arrives, which can move
          // the row while the scroll is still under way. Once it settles the row is looked at
          // again — once, and only just now, so a member scrolling away later is left alone.
          const settle = () => {
            if (!inView(row)) {
              row.scrollIntoView({ block: 'nearest' });
            }
          };
          if ('onscrollend' in window) {
            window.addEventListener('scrollend', settle, { once: true });
            setTimeout(() => window.removeEventListener('scrollend', settle), 2000);
          } else {
            setTimeout(settle, 800);
          }
        });
      },
    }),
    [],
  );

  // Read here rather than handed down, for the same reason the reading panel reads its own
  // Listings: what a screen needs is that screen's business, and a page that fetched for both
  // would be the one place a change to either had to be remembered.
  const { isEditor } = useSession();
  const { data, isPending, error } = useTavolaListings(tavolaId);
  const listings = data?.listings ?? [];

  const byPosition = new Map<string, TavolaListing[]>();
  const unplaced: TavolaListing[] = [];

  for (const listing of listings) {
    if (listing.positionId === null) {
      unplaced.push(listing);
      continue;
    }
    const found = byPosition.get(listing.positionId);
    if (found) {
      found.push(listing);
    } else {
      byPosition.set(listing.positionId, [listing]);
    }
  }

  return (
    <section
      ref={section}
      aria-labelledby="sheet-parts"
      data-testid="sheet-parts"
      className="parts-jump-target"
    >
      {jump.top}
      <h2 id="sheet-parts" className="label">
        The parts on this sheet
      </h2>
      <p className="mt-2 max-w-measure text-sm text-pretty text-muted">
        Every number the factory printed, and what is recorded at it. Select one to read it and to
        take the drawing there.
      </p>

      {isPending && <p className="mt-6 text-muted">Reading the list…</p>}
      {error && <Refusal>{error.message}</Refusal>}

      {!isPending && !error && positions.length === 0 && unplaced.length === 0 && (
        <p className="mt-6 max-w-measure text-pretty text-muted">
          No numbers have been recorded on this drawing yet.
        </p>
      )}

      {positions.length > 0 && (
        <ul className="mt-6 border-b border-line">
          {positions.map((position) => (
            <li key={position.id}>
              <SheetLine
                position={position}
                listings={byPosition.get(position.id) ?? []}
                // **Whether the archive has answered yet**, which is the difference between a
                // number nothing is recorded at and a number nothing is known about *yet*. The
                // sheet's numbers arrive with the drawing and are printed straight away — a
                // member can select one before the text lands — but until the index is in, no
                // row may say "not recorded", which is the one claim this list exists to make.
                known={!isPending && !error}
                selected={position.id === selectedPositionId}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}

      {/*
       * A Part the catalog names on this sheet that nobody has given a number to — a state the
       * archive has had since Listings existed and this is the first screen it can be seen on.
       * It is not selectable, because there is no circle to be taken to and nothing to read at a
       * number that does not exist.
       */}
      {unplaced.length > 0 && (
        <div className="mt-8">
          <h3 className="label">Listed without a number</h3>
          <p className="mt-2 max-w-measure text-sm text-pretty text-faint">
            Named on this sheet by the catalog, with no position of their own.
          </p>
          <ul className="mt-4 border-t border-b border-line" data-testid="unplaced-parts">
            {unplaced.map((listing) => (
              <li
                key={listing.id}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line py-3 last:border-b-0"
              >
                <ListedLine listing={listing} />
                {isEditor && positions.length > 0 && (
                  <PutAtNumber
                    tavolaId={tavolaId}
                    listing={listing}
                    positions={positions}
                    empty={positions.filter((position) => !byPosition.has(position.id))}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {jump.bottom}
    </section>
  );
}

/** Wholly inside the window, below the chrome that stays over the top of it. */
function inView(element: HTMLElement): boolean {
  const box = element.getBoundingClientRect();
  const chrome = document.querySelector('[data-chrome]')?.getBoundingClientRect().bottom ?? 0;
  return box.top >= chrome && box.bottom <= window.innerHeight;
}

/**
 * One number, and what sits at it.
 *
 * The number wears the Mark's blue, as a chip, when it is the one being read — the same blue as its circle on
 * the sheet, because they are one thing being pointed at and colouring them differently would
 * leave a member to work out that they are the same.
 */
function SheetLine({
  position,
  listings,
  known,
  selected,
  onSelect,
}: {
  position: Position;
  listings: TavolaListing[];
  /** Whether what is listed on this sheet has been read yet. Until it has, this says nothing. */
  known: boolean;
  selected: boolean;
  onSelect: (position: Position) => void;
}) {
  return (
    <button
      type="button"
      data-testid="sheet-line"
      data-position={position.number}
      data-position-id={position.id}
      // Whether anything at all is recorded at this number, which is what story 45 asks the list
      // to say — and what the browser seam asserts, since "visibly marked" is not a response
      // body. Absent while the answer is still coming, rather than `false`.
      data-recorded={known ? String(listings.length > 0) : undefined}
      aria-pressed={selected}
      onClick={() => onSelect(position)}
      // A number the sheet does not print wears the broken rule this archive uses for "nothing
      // on the plate to go and look for" — the same mark an undrawn Part wears in the panel
      // above, which is a different statement carrying the same instruction to the eye.
      className={cn(
        'sheet-line listed',
        position.marks.length === 0 && 'not-on-the-plate',
        selected && 'bg-surface-sunken',
      )}
    >
      <span className="flex flex-col gap-1">
        <span
          className={cn(
            'tabular text-lg',
            position.marks.length === 0 ? 'text-muted' : 'text-text',
            selected && 'self-start rounded-sm bg-mark px-2 text-mark-contrast',
          )}
        >
          {position.number}
          {position.marks.length === 0 && (
            <span className="sr-only">, not drawn on this sheet</span>
          )}
        </span>
        {/*
         * How many places the factory printed it — in words rather than as `×4`, because the
         * quantities beside the Parts on this same row are already written that way and two
         * different counts wearing one notation is how a member orders four of something the car
         * takes one of.
         */}
        {position.marks.length > 1 && <span className="tag">{position.marks.length} places</span>}
      </span>

      {listings.length === 0 ? (
        <span className="text-sm text-pretty text-faint">{known ? 'Not recorded yet' : ''}</span>
      ) : (
        <span className="flex flex-col gap-2">
          {listings.map((listing) => (
            <ListedLine key={listing.id} listing={listing} />
          ))}
        </span>
      )}
    </button>
  );
}

/** A Part as the index names it: what it is called, and the number it is ordered by. */
function ListedLine({ listing }: { listing: TavolaListing }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-pretty">
        {listing.part.nameEn === null ? (
          listing.part.nameIt
        ) : (
          <EnglishName
            nameEn={listing.part.nameEn}
            nameIt={listing.part.nameIt}
            machineTranslated={listing.part.nameEnMachineTranslated}
          />
        )}
      </span>
      {listing.part.catalogNumber !== null && (
        <span className="tabular text-sm text-muted">{listing.part.catalogNumber}</span>
      )}
      {listing.quantityPerCar !== null && (
        <span className="tabular text-sm text-faint">×{listing.quantityPerCar}</span>
      )}
      {/* Said here too, because a member skimming a list must not read a fixing as an
          alternative — the panel that spells the difference out is one click away. */}
      {!listing.drawn && <span className="tag">Not drawn</span>}
    </span>
  );
}

/**
 * **Giving a part the number the reading could not make out** (issue #242). A row whose number
 * was too faint to read still arrives as a Listing, with no Position; once an Editor has found
 * the number on the drawing, this joins the two. Typing the part in again would list it twice.
 *
 * The numbers nothing is recorded at come first, because a part without a number and a number
 * without a part are almost always each other. Choosing one is the whole act: the Listing keeps
 * its quantity and whether it is drawn, and a slip is undone the way any misplaced Listing is,
 * from the panel at the number it went to.
 */
function PutAtNumber({
  tavolaId,
  listing,
  positions,
  empty,
}: {
  tavolaId: string;
  listing: TavolaListing;
  positions: Position[];
  /** The sheet's numbers with nothing recorded at them yet. */
  empty: Position[];
}) {
  const id = useId();
  const reread = useRereadMovedListing(tavolaId);
  const put = useMutation({
    mutationFn: (positionId: string) =>
      api.correctListing(listing.id, {
        positionId,
        quantityPerCar: listing.quantityPerCar,
        drawn: listing.drawn,
      }),
    onSuccess: () => reread(),
  });
  const taken = positions.filter((position) => !empty.includes(position));

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-center gap-3 text-sm text-muted">
        Put at
        <select
          id={id}
          data-testid="put-at-number"
          value=""
          disabled={put.isPending}
          onChange={(event) => {
            if (event.target.value !== '') {
              put.mutate(event.target.value);
            }
          }}
          className="tabular h-control rounded-md border border-line-strong bg-surface-raised px-3 text-base text-text"
        >
          <option value="">{put.isPending ? 'Putting…' : 'Choose a number'}</option>
          {empty.length > 0 && (
            <optgroup label="Nothing recorded yet">
              {empty.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.number}
                </option>
              ))}
            </optgroup>
          )}
          {taken.length > 0 && (
            <optgroup label="Already has a part">
              {taken.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.number}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {put.isError && <Refusal>{put.error.message}</Refusal>}
    </div>
  );
}
