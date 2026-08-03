import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { CopyLink } from '@/components/copy-link';
import { Refusal } from '@/components/ui/field';
import type { CatalogModel, PartListing, Position } from '@/lib/api';
import { usePositionListings } from '@/lib/parts';
import { cn } from '@/lib/utils';

/**
 * **The last clause of the sentence this whole product is**: *choose your car, open the drawing,
 * click the position, read the part.*
 *
 * It sits **beside** the drawing and never instead of it (story 44). A member reading a part
 * number is looking at the circle it came from, and an archive that replaced the sheet with the
 * text would be asking them to hold two things in their head that they were holding in one hand
 * a moment ago.
 *
 * What the panel is arranged around is a single distinction: **an alternative is not an
 * addition.** Two drawn Parts at one Position are fitted instead of one another; the undrawn
 * ones sharing it are the screws and washers needed as well. Getting that backwards is the wrong
 * parts arriving in the post, so it is carried three times over — by the order, by a heading in
 * plain words, and by a broken rule that means the same thing here as it does on the sheet's own
 * numbers below.
 */
export function PartReading({
  position,
  markId,
  unknownNumber,
  tavola,
}: {
  position: Position | null;
  /** Which of the number's circles is being read, for a number printed more than once. */
  markId: string | null;
  /** A number the address asked for that this sheet does not carry, if it asked for one. */
  unknownNumber: string | null;
  /** Where the member is, so the Part says what it is being read at (story 59). */
  tavola: { number: string; nameEn: string; model: CatalogModel };
}) {
  if (!position) {
    return (
      <div className="max-w-measure text-pretty text-muted">
        {unknownNumber !== null && (
          <p className="mb-4" data-testid="unknown-number">
            This drawing has no number <span className="tabular">{unknownNumber}</span> on it. The
            link may have been meant for another sheet.
          </p>
        )}
        <p>Click a circle on the drawing, or a number in the list, to read the part at it.</p>
      </div>
    );
  }

  // Keyed by the Position, so moving between numbers is a fresh read rather than the previous
  // Part lingering under a new heading while the next one arrives.
  return <Reading key={position.id} position={position} markId={markId} tavola={tavola} />;
}

function Reading({
  position,
  markId,
  tavola,
}: {
  position: Position;
  markId: string | null;
  tavola: { number: string; nameEn: string; model: CatalogModel };
}) {
  const { data, isPending, isError, error } = usePositionListings(position.id);

  const listings = data?.listings ?? [];
  const drawn = listings.filter((listing) => listing.drawn);
  const undrawn = listings.filter((listing) => !listing.drawn);

  return (
    <section
      aria-labelledby="position"
      aria-live="polite"
      className="animate-rise"
      data-testid="part-reading"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="position" className="text-2xs text-muted uppercase">
          Position
        </h2>
        <CopyLink />
      </div>
      {/*
       * The number in the Club's teal, which the visual language sanctions for a Mark **and the
       * Position it belongs to wherever else that Position appears**. The circle on the sheet and
       * this number are one thing being pointed at, and colouring them differently would leave a
       * member to work out that they are the same.
       */}
      <p className="tabular mt-2 text-4xl text-accent-ink" data-testid="selected-position">
        {position.number}
      </p>

      {/* Which car and which sheet: a member who has followed a link here has not seen the page
          header, and one who is deep in a drawing should never have to scroll up to check. */}
      <p className="mt-3 text-2xs text-faint uppercase">
        {tavola.model.brand} {tavola.model.name} · Tavola{' '}
        <span className="tabular">{tavola.number}</span> · {tavola.nameEn}
      </p>
      <p className="mt-3 max-w-measure text-sm text-pretty text-faint">
        {describeMarks(position, markId)}
      </p>

      {isPending && <p className="mt-8 text-muted">Reading…</p>}
      {isError && <Refusal>{error.message}</Refusal>}

      {!isPending && !isError && listings.length === 0 && (
        <p className="mt-8 max-w-measure text-pretty text-muted">
          Nothing is recorded at this position yet. The number is on the sheet; what sits at it has
          not been written down.
        </p>
      )}

      {drawn.length > 0 && (
        <Group
          className="mt-8"
          // With one drawn Part and nothing else, the heading would be saying what the panel
          // already says. It earns its place the moment there is something to tell it apart from.
          title={
            drawn.length > 1
              ? 'Alternatives'
              : undrawn.length > 0
                ? 'The part at this position'
                : null
          }
          note={
            drawn.length > 1
              ? 'Fitted instead of one another. The car takes one of these, not all of them.'
              : null
          }
          listings={drawn}
        />
      )}

      {undrawn.length > 0 && (
        <Group
          className="mt-10 border-t border-line pt-8"
          title="Also needed"
          note="Not drawn on this sheet. They share this position and are fitted as well."
          listings={undrawn}
        />
      )}
    </section>
  );
}

function Group({
  title,
  note,
  listings,
  className,
}: {
  title: string | null;
  note: string | null;
  listings: PartListing[];
  className: string;
}) {
  return (
    <div className={className}>
      {title && <h3 className="text-2xs text-muted uppercase">{title}</h3>}
      {note && <p className="mt-2 max-w-measure text-sm text-pretty text-faint">{note}</p>}
      <ul className={title ? 'mt-6 flex flex-col gap-10' : 'flex flex-col gap-10'}>
        {listings.map((listing) => (
          <li
            key={listing.id}
            className={cn('listed', !listing.drawn && 'not-on-the-plate')}
            data-drawn={listing.drawn}
            data-testid="listed-part"
          >
            <ListedPart listing={listing} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ListedPart({ listing }: { listing: PartListing }) {
  const { part } = listing;
  // A Part always has one of the two names. The Italian is what the catalog printed, so it stays
  // underneath rather than being translated away — but it is not repeated as its own heading.
  const heading = part.nameEn ?? part.nameIt;
  const beneath = part.nameEn ? part.nameIt : null;

  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <h4 className="text-lg font-semibold text-pretty">{heading}</h4>
        {listing.quantityPerCar !== null && (
          <p className="shrink-0 text-sm text-muted">
            <span className="sr-only">Quantity </span>
            <span className="tabular">×{listing.quantityPerCar}</span> per car
          </p>
        )}
      </div>
      {beneath && <p className="mt-1 text-pretty text-muted">{beneath}</p>}

      {/*
       * The two numbers a member quotes, side by side and set large: the Catalog Number is what
       * they order by and the Disegno Origine is what they quote in a letter. Both monospace and
       * tabular, because they are compared character by character against a stamped bracket.
       */}
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-4">
        <dt className="text-2xs text-muted uppercase">Catalog number</dt>
        <dt className="text-2xs text-muted uppercase">Disegno origine</dt>
        <dd className="tabular text-lg" data-testid="catalog-number">
          {part.catalogNumber ?? <span className="text-sm text-faint">None recorded</span>}
        </dd>
        <dd className="tabular text-lg">
          {part.disegnoOrigine ?? <span className="text-sm text-faint">None recorded</span>}
        </dd>
      </dl>

      {/* Said once, plainly, so nobody goes hunting for a number that does not exist (story 58). */}
      {part.catalogNumber === null && (
        <p className="mt-3 max-w-measure text-xs text-pretty text-faint">
          Not every part was given a catalog number. This is the record, not a gap in it.
        </p>
      )}

      <Prose label="Description">{part.description}</Prose>
      <Prose label="Dimensions" mono>
        {part.dimensions}
      </Prose>
      <Prose label="Material and finish">{part.materialFinish}</Prose>

      {/*
       * **Evidence, then interpretation, and never the two run together.** The factory's words
       * are boxed because they are quoted from a document; the club's are plain prose because
       * they are this archive speaking. A member deciding what to buy is weighing one against
       * the other, and the difference has to be visible before either is read (story 62).
       */}
      {part.catalogNote !== null && (
        <div className="transcription mt-6" data-testid="catalog-note">
          <h5 className="text-2xs text-muted uppercase">From the factory catalog</h5>
          <p className="mt-2 text-sm text-pretty">{part.catalogNote}</p>
        </div>
      )}
      {part.note !== null && (
        <div className="mt-6" data-testid="club-note">
          <h5 className="text-2xs text-muted uppercase">The club’s note</h5>
          <p className="mt-2 max-w-measure text-sm text-pretty text-muted">{part.note}</p>
        </div>
      )}

      <Elsewhere listing={listing} />
    </>
  );
}

/** One of the Part's prose fields, absent entirely when nobody has recorded it. */
function Prose({
  label,
  mono = false,
  children,
}: {
  label: string;
  mono?: boolean;
  children: string | null;
}) {
  if (children === null) {
    return null;
  }

  return (
    <div className="mt-5">
      <h5 className="text-2xs text-muted uppercase">{label}</h5>
      <p className={mono ? 'tabular mt-1 text-base' : 'mt-1 max-w-measure text-pretty'}>
        {children}
      </p>
    </div>
  );
}

/**
 * Where else the same component turns up (story 68) — the answer a member gets for free from
 * the archive keeping one Part rather than one row per drawing (ADR 0001).
 *
 * Every line is a link, because "it is also on Tavola 10" is only half an answer if going there
 * means starting from the catalog again.
 */
function Elsewhere({ listing }: { listing: PartListing }): ReactNode {
  if (listing.elsewhere.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 border-t border-line pt-4">
      <h5 className="text-2xs text-muted uppercase">Also on</h5>
      <ul className="mt-2 flex flex-col gap-2">
        {listing.elsewhere.map((where, index) => (
          <li key={`${where.tavolaId}-${where.positionNumber ?? index}`} className="text-sm">
            <Link
              to="/tavole/$tavolaId"
              params={{ tavolaId: where.tavolaId }}
              className="text-accent-ink underline-offset-4 hover:underline"
            >
              <span className="tabular">Tavola {where.tavolaNumber}</span> — {where.nameEn}
            </Link>
            <span className="text-faint">
              {' '}
              · {where.model.brand} {where.model.name}
              {where.positionNumber !== null && (
                <>
                  {' '}
                  · position <span className="tabular">{where.positionNumber}</span>
                </>
              )}
              {where.quantityPerCar !== null && (
                <>
                  {' '}
                  · <span className="tabular">×{where.quantityPerCar}</span>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Where the number is on the sheet. Worth saying plainly: a number the factory printed in four
 * places is a part fitted in four places, which is a thing a member wants to know before they
 * order one — and a number printed nowhere is a part the drawing simply does not show.
 *
 * For a number printed more than once it also says **which** of them is being read and how to
 * reach the next, because that is how a member finds out the part is used in several places at
 * all (story 48): the sentence is where the behaviour is taught, since nothing else on the screen
 * could tell them that selecting a number twice means something.
 */
function describeMarks(position: Position, markId: string | null): string {
  if (position.marks.length === 0) {
    return 'This number is listed but not drawn — it is not printed anywhere on this sheet.';
  }
  if (position.marks.length === 1) {
    return 'Printed once on this drawing.';
  }

  // Named as what it is on both surfaces: pointing at a circle reads *that* circle, and it is
  // the list — beside the drawing, or below it on a phone — that steps from one to the next.
  const at = position.marks.findIndex((mark) => mark.id === markId);
  if (at === -1) {
    return `Printed in ${position.marks.length} places on this drawing.`;
  }
  return `Printed in ${position.marks.length} places on this drawing. This is ${at + 1} of them — selecting the number in the list again moves to the next.`;
}
