import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { MemberContributions } from '@/components/contributions/member-contributions';
import { CopyLink } from '@/components/copy-link';
import {
  ConfirmEnglish,
  EnglishName,
  MachineTranslationTag,
} from '@/components/machine-translation';
import { PartPhotographs } from '@/components/parts/part-photographs';
import { Refusal } from '@/components/ui/field';
import {
  api,
  type CatalogModel,
  type Contribution,
  type PartInFull,
  type PartListing,
  type Position,
} from '@/lib/api';
import { usePositionContributions } from '@/lib/contributions';
import {
  EQUIVALENT_KIND_LABELS,
  SOURCE_CONDITION_LABELS,
  formatObservedOn,
  formatPrice,
} from '@/lib/part-record';
import { useRereadPart, usePositionListings } from '@/lib/parts';
import { useSession } from '@/lib/session';
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
  belongsWith,
}: {
  position: Position | null;
  /** Which of the number's circles is being read, for a number printed more than once. */
  markId: string | null;
  /** A number the address asked for that this sheet does not carry, if it asked for one. */
  unknownNumber: string | null;
  /** Where the member is, so the Part says what it is being read at (story 59). */
  tavola: { number: string; nameEn: string; model: CatalogModel };
  /**
   * What belongs with this number — its Sub-assembly and the numbers it works with.
   *
   * **A slot rather than four props threaded through.** What goes in it is about the *sheet* and
   * not about the Part, and every fact it needs is one this panel would otherwise be handed
   * without ever reading. The page composes it; this places it, above what sits at the number.
   */
  belongsWith?: ReactNode;
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
  return (
    <Reading
      key={position.id}
      position={position}
      markId={markId}
      tavola={tavola}
      belongsWith={belongsWith}
    />
  );
}

function Reading({
  position,
  markId,
  tavola,
  belongsWith,
}: {
  position: Position;
  markId: string | null;
  tavola: { number: string; nameEn: string; model: CatalogModel };
  belongsWith?: ReactNode;
}) {
  const { data, isPending, isError, error } = usePositionListings(position.id);

  // Read beside the Listings rather than with them: what members have said is this member's
  // answer and nobody else's, and a Part reads the same for everybody. If it cannot be read the
  // panel still says what sits at the number, which is what it is for.
  const fromMembers = usePositionContributions(position.id);
  const contributions = fromMembers.data?.contributions ?? [];

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
        <h2 id="position" className="label">
          Position
        </h2>
        <CopyLink />
      </div>
      {/*
       * The number on the Mark's own blue, which the visual language sanctions for a Mark **and the
       * Position it belongs to wherever else that Position appears**. The circle on the sheet and
       * this number are one thing being pointed at, and colouring them differently would leave a
       * member to work out that they are the same.
       */}
      <p
        className="tabular mt-2 w-fit rounded-md bg-mark px-3 py-1 text-4xl text-mark-contrast"
        data-testid="selected-position"
      >
        {position.number}
      </p>

      {/* Which car and which sheet: a member who has followed a link here has not seen the page
          header, and one who is deep in a drawing should never have to scroll up to check. */}
      <p className="tag mt-3">
        {tavola.model.brand} {tavola.model.name} · Tavola{' '}
        <span className="tabular">{tavola.number}</span> · {tavola.nameEn}
      </p>
      <p className="mt-3 max-w-measure text-sm text-pretty text-faint">
        {describeMarks(position, markId)}
      </p>

      {/*
       * **What belongs with the number, above what sits at it.** Both are facts about this
       * Position rather than about any Part, so they go with the number in the heading — and a
       * member reading a Position carrying five Parts each with three lists of their own would
       * otherwise have to scroll past all of it to find out that the number is one of eleven.
       */}
      {belongsWith}

      {isPending && <p className="mt-8 text-muted">Reading…</p>}
      {isError && <Refusal>{error.message}</Refusal>}

      {!isPending && !isError && listings.length === 0 && (
        <p className="mt-8 max-w-measure text-pretty text-muted">
          Nothing is recorded at this position yet. The number is on the sheet; what sits at it has
          not been written down. If you know what it is, say so — that is how a gap gets filled.
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
          contributions={contributions}
        />
      )}

      {undrawn.length > 0 && (
        <Group
          className="mt-10 border-t border-line pt-8"
          title="Also needed"
          note="Not drawn on this sheet. They share this position and are fitted as well."
          listings={undrawn}
          contributions={contributions}
        />
      )}

      {/*
       * **About the number itself, last** — and the only thing here at all when nothing is
       * recorded at it. The archive shows members which circles are empty; this is what stops
       * that being a gap pointed at with no way to fill it (story 84).
       */}
      {/* Said, because the alternative is a member who cannot see what they sent and sends it
          again (story 87). */}
      {fromMembers.isError && (
        <p className="mt-6 max-w-measure text-sm text-pretty text-muted" role="status">
          What members have written here could not be read just now. Anything you have sent is safe;
          it will show when the archive answers.
        </p>
      )}

      {!isPending && !isError && (
        <MemberContributions
          target={{ kind: 'position', positionId: position.id }}
          contributions={contributions.filter(
            (contribution) =>
              contribution.target.kind === 'position' &&
              contribution.target.positionId === position.id,
          )}
          about={`position ${position.number}`}
          thing="this position"
        />
      )}
    </section>
  );
}

function Group({
  title,
  note,
  listings,
  contributions,
  className,
}: {
  title: string | null;
  note: string | null;
  listings: PartListing[];
  /** Everything said at this number. Each Part picks out its own. */
  contributions: Contribution[];
  className: string;
}) {
  return (
    <div className={className}>
      {title && <h3 className="label">{title}</h3>}
      {note && <p className="mt-2 max-w-measure text-sm text-pretty text-faint">{note}</p>}
      <ul className={title ? 'mt-6 flex flex-col gap-10' : 'flex flex-col gap-10'}>
        {listings.map((listing) => (
          <li
            key={listing.id}
            className={cn('listed', !listing.drawn && 'not-on-the-plate')}
            data-drawn={listing.drawn}
            data-testid="listed-part"
          >
            <ListedPart
              listing={listing}
              contributions={contributions.filter(
                (contribution) =>
                  contribution.target.kind === 'part' &&
                  contribution.target.partId === listing.part.id,
              )}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ListedPart({
  listing,
  contributions,
}: {
  listing: PartListing;
  contributions: Contribution[];
}) {
  const { part } = listing;
  const { isEditor } = useSession();
  const rereadPart = useRereadPart();
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
      {beneath && (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-3 text-pretty text-muted">
          <span lang="it">{beneath}</span>
          {part.nameEnMachineTranslated && <MachineTranslationTag />}
        </p>
      )}
      {isEditor && part.nameEnMachineTranslated && part.nameEn !== null && (
        <ConfirmEnglish
          confirm={async () => {
            await api.namePartInEnglish(part.id, part.nameEn as string);
            await rereadPart();
          }}
        />
      )}

      {/*
       * **What it looks like, above the numbers you quote** (story 77). A member holding a
       * bracket is comparing a shape, and two calipers that differ only in where a boss sits
       * carry the same words and the same transcribed note. The picture is what settles it, and
       * it settles it before anything on this panel has been read — so it goes here, and the
       * numbers stay where a hand reaches for them once the shape is confirmed.
       */}
      <PartPhotographs photographs={part.photographs} partName={heading ?? 'this part'} />

      {/*
       * The two numbers a member quotes, side by side and set large: the Catalog Number is what
       * they order by and the Disegno Origine is what they quote in a letter. Both monospace and
       * tabular, because they are compared character by character against a stamped bracket.
       */}
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-4">
        <dt className="label">Catalog number</dt>
        <dt className="label">Disegno origine</dt>
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
      <Specifications part={part} />

      {/*
       * **Evidence, then interpretation, and never the two run together.** The factory's words
       * are boxed because they are quoted from a document; the club's are plain prose because
       * they are this archive speaking. A member deciding what to buy is weighing one against
       * the other, and the difference has to be visible before either is read (story 62).
       */}
      {part.catalogNote !== null && (
        <div className="transcription mt-6" data-testid="catalog-note">
          <h5 className="label">From the factory catalog</h5>
          <p lang="it" className="mt-2 text-sm text-pretty">
            {part.catalogNote}
          </p>
          {part.catalogNoteEn !== null && (
            <p className="mt-1 text-sm text-pretty text-muted">
              {part.catalogNoteEn} <MachineTranslationTag />
            </p>
          )}
        </div>
      )}
      {part.note !== null && (
        <div className="mt-6" data-testid="club-note">
          <h5 className="label">The club’s note</h5>
          <p className="mt-2 max-w-measure text-sm text-pretty text-muted">{part.note}</p>
        </div>
      )}

      <Fits part={part} />
      <Equivalents part={part} />
      <Sources part={part} />

      <Elsewhere listing={listing} />

      {/*
       * **What members know that the record does not say yet** (story 91), and the two things a
       * member can do about a Part: add to it, or say it is wrong. Last, because it is the one
       * block here that is not the archive speaking.
       */}
      <MemberContributions
        target={{ kind: 'part', partId: part.id }}
        contributions={contributions}
        about={heading ?? 'this part'}
        thing="this part"
        canReportWrong
      />
    </>
  );
}

/**
 * One block of what the archive knows about the component itself — which cars it fits, what
 * replaces it, where it has been for sale.
 *
 * **Absent entirely when there is nothing in it.** A Position carrying two alternatives and
 * three fixings is five Parts, and five Parts each wearing three headings saying "nothing
 * recorded" is a column of denials a member has to read past to reach the one that is filled in.
 * The archive says "nothing is recorded here" about a *number* (story 45), where the claim is
 * worth making; it does not say it three times about every component on the sheet.
 */
function Block({
  title,
  note,
  children,
  testId,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <div className="mt-6 border-t border-line pt-4" data-testid={testId}>
      <h5 className="label">{title}</h5>
      {note && <p className="mt-2 max-w-measure text-xs text-pretty text-faint">{note}</p>}
      <ul className="mt-3 flex flex-col gap-3">{children}</ul>
    </div>
  );
}

/**
 * What the Part is made of, measures and weighs (issue #112), in the order of the
 * Administrator's list of names, and the same on every sheet the Part is listed on.
 *
 * **Name, value, Unit, in two columns**: the names down the left in the label's quiet weight,
 * the values down the right where the eye runs looking for one. A number is set tabular with its
 * Unit beside it in the muted colour, because the Unit is the name's and the number is the fact.
 * Absent entirely for a Part with none, as every block on this panel is.
 */
function Specifications({ part }: { part: PartInFull }): ReactNode {
  if (part.specifications.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 border-t border-line pt-4" data-testid="specifications">
      <h5 className="label">Specifications</h5>
      <dl className="mt-3 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-4 gap-y-2">
        {part.specifications.map((specification) => (
          <div key={specification.id} className="contents" data-testid="specification">
            <dt className="text-sm text-muted">{specification.name}</dt>
            <dd className="text-pretty">
              {specification.unit === null ? (
                specification.value
              ) : (
                <>
                  <span className="tabular">{specification.value}</span>
                  <span className="tabular text-muted"> {specification.unit}</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Which cars this Part fits, **with the qualification in the words whoever knew it would use**
 * (stories 70, 71).
 *
 * The qualifier is printed as it was written and nothing tidies it up: *"from chassis #310"*,
 * *"late"*, *"1963–64"* are all somebody's honest answer, and the member is the one who decides
 * whether their car is on the right side of the break. An archive that made this look more exact
 * than it is would be the archive guessing on their behalf.
 */
function Fits({ part }: { part: PartInFull }): ReactNode {
  if (part.fitments.length === 0) {
    return null;
  }

  return (
    <Block title="Fits" testId="fitments">
      {part.fitments.map((fitment) => (
        <li key={fitment.id} className="text-sm">
          {fitment.model.brand} {fitment.model.name}
          {fitment.model.series && <span className="text-muted"> {fitment.model.series}</span>}
          {fitment.qualifier !== null && <span className="text-faint"> — {fitment.qualifier}</span>}
        </li>
      ))}
    </Block>
  );
}

/**
 * **What can be bought instead, which is the most valuable thing on this panel.** The original
 * has not been made for fifty years; a bearing number that is still in production is what
 * actually gets the car back on the road (story 72), and a donor vehicle is what sends somebody
 * to a scrapyard with something to look for (story 73).
 *
 * The reference is set like every other number in this archive — monospace and tabular, because
 * it is about to be typed into somebody's parts supplier. What kind of thing it is sits above it
 * in plain words, since ordering a *standard* and going to find a *car* are not the same errand.
 */
function Equivalents({ part }: { part: PartInFull }): ReactNode {
  if (part.equivalents.length === 0) {
    return null;
  }

  return (
    <Block title="Instead of the original" testId="equivalents">
      {part.equivalents.map((equivalent) => (
        <li key={equivalent.id}>
          <p className="tag">{EQUIVALENT_KIND_LABELS[equivalent.kind]}</p>
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-pretty">{equivalent.maker}</p>
            {/* Absent rather than empty. For a donor vehicle nobody usually knows the number,
                and the car alone is the useful fact. */}
            {equivalent.reference !== null && (
              <p className="tabular shrink-0 text-base">{equivalent.reference}</p>
            )}
          </div>
          {equivalent.note !== null && (
            <p className="mt-1 max-w-measure text-sm text-pretty text-muted">{equivalent.note}</p>
          )}
        </li>
      ))}
    </Block>
  );
}

/**
 * Where the Part has actually been available, and what it cost **on a stated day** (story 74).
 *
 * The heading is *seen for sale* rather than *available*, because that is what the archive can
 * honestly claim: somebody looked, once, on a date. The note under it says the same thing in a
 * sentence, and the price says it a third time by never appearing without the day beside it.
 */
function Sources({ part }: { part: PartInFull }): ReactNode {
  if (part.sources.length === 0) {
    return null;
  }

  return (
    <Block
      title="Seen for sale"
      note="What somebody saw on the day beside it, not what anything costs now."
      testId="sources"
    >
      {part.sources.map((source) => (
        <li key={source.id}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <a
              href={source.url}
              // Somewhere outside the archive, so it opens outside it — and the pair of tokens
              // is what stops the other page reaching back through this one.
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent-ink underline-offset-4 hover:underline"
            >
              {source.name}
            </a>
            <p className="tag">
              {source.condition === null
                ? 'Condition not stated'
                : SOURCE_CONDITION_LABELS[source.condition]}
            </p>
          </div>
          {/*
           * **The price and the date it was seen, in one sentence on one line.** They are one
           * fact (stories 75, 76): the shape they arrive in cannot hold an amount without a day,
           * and this is that rule made visible — there is nowhere on this screen for a figure to
           * be printed on its own.
           */}
          {source.price !== null && (
            <p className="mt-1 text-sm" data-testid="observed-price">
              <span className="tabular text-base">{formatPrice(source.price)}</span>
              <span className="text-muted">
                {' '}
                seen on {formatObservedOn(source.price.observedOn)}
              </span>
            </p>
          )}
          {source.note !== null && (
            <p className="mt-1 max-w-measure text-sm text-pretty text-muted">{source.note}</p>
          )}
        </li>
      ))}
    </Block>
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
      <h5 className="label">{label}</h5>
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
      <h5 className="label">Also on</h5>
      <ul className="mt-2 flex flex-col gap-2">
        {listing.elsewhere.map((where, index) => (
          <li key={`${where.tavolaId}-${where.positionNumber ?? index}`} className="text-sm">
            <Link
              to="/tavole/$tavolaId"
              params={{ tavolaId: where.tavolaId }}
              className="text-accent-ink underline-offset-4 hover:underline"
            >
              <span className="tabular">Tavola {where.tavolaNumber}</span> —{' '}
              <EnglishName
                nameEn={where.nameEn}
                nameIt={where.nameIt}
                machineTranslated={where.nameEnMachineTranslated}
              />
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
