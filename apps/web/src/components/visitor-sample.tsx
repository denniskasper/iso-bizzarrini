import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { sampleDrawing } from '@/components/samples/sample-shelf';
import { SignInLink } from '@/components/sign-in-link';
import { Button } from '@/components/ui/button';
import { DrawingViewer } from '@/components/viewer/drawing-viewer';
import { MarkLayer } from '@/components/viewer/mark-layer';
import { VisitorLanding } from '@/components/visitor-landing';
import { ApiError, api, type Position, type VisitorListing, type VisitorSample } from '@/lib/api';
import { positionMatching } from '@/lib/positions';

/**
 * **A Tavola's address, for somebody who is not signed in** (issue #132, ADR 0019).
 *
 * A Sample is shown here as the factory printed it: the public copy of its drawing, every number
 * drawn, and the Parts at the one number that is open. Anything else at this address is the
 * members-only page with the way to join and the Samples, and nothing of the Tavola asked for —
 * the archive answers both the same, so not even its name is known here.
 */
export function VisitorTavola({ tavolaId }: { tavolaId: string }) {
  const { data, isPending, error } = useQuery({
    queryKey: ['visitor-sample', tavolaId],
    queryFn: () => api.visitorSample(tavolaId),
    retry: false,
  });

  if (isPending) {
    return <p className="text-lg text-muted">Reading the drawing…</p>;
  }

  if (data) {
    return <SampleView sample={data.sample} />;
  }

  return (
    <div>
      <section
        aria-labelledby="for-members"
        className="mb-24 border-b border-line pb-16"
        data-testid="members-only-tavola"
      >
        <h2 id="for-members" className="text-3xl font-semibold text-balance">
          This drawing is for members.
        </h2>
        <p className="mt-4 max-w-measure text-lg text-pretty text-muted">
          {error instanceof ApiError && error.status === 404
            ? 'A member opens it here once signed in. A few drawings are shown to everybody, below, with one number open on each.'
            : 'The archive could not be reached. Try again shortly.'}
        </p>
      </section>
      <VisitorLanding />
    </div>
  );
}

/**
 * The numbers as the drawing's circles want them. The ids are made up here, since a Visitor is
 * sent none: the circles need something to be told apart by, and the number is unique on a sheet.
 */
function toPositions(sample: VisitorSample): Position[] {
  return sample.positions.map((position) => ({
    id: position.number,
    number: position.number,
    marks: position.marks.map((mark, index) => ({ ...mark, id: `${position.number}:${index}` })),
    subAssemblyId: null,
    related: [],
  }));
}

/**
 * **The member's page, with one number open.** The same two columns, drawing first: the column
 * beside it reads the open number's Parts, or, for a locked number, says what membership gives
 * and leads to joining. Locked circles recede the way every number not asked about does, so the
 * open one is the bright circle on the sheet without a second colour to learn.
 */
function SampleView({ sample }: { sample: VisitorSample }) {
  const { tavola } = sample;
  const { position: linked } = useSearch({ from: '/tavole/$tavolaId' });
  const navigate = useNavigate({ from: '/tavole/$tavolaId' });
  const [markId, setMarkId] = useState<string | null>(null);

  const positions = useMemo(() => toPositions(sample), [sample]);
  const open = positions.find((position) => position.number === sample.open.number) ?? null;
  const lit = useMemo(() => new Set(open ? [open.id] : []), [open]);
  // Nothing asked for is the open number: it is what this page is for.
  const selected = (linked === undefined ? null : positionMatching(positions, linked)) ?? open;
  const locked = selected !== null && selected.id !== open?.id;

  const select = (position: Position, mark: { id: string } | null) => {
    setMarkId(mark?.id ?? null);
    void navigate({
      to: '/tavole/$tavolaId',
      params: { tavolaId: tavola.id },
      search: position.id === open?.id ? {} : { position: position.number },
      replace: true,
      resetScroll: false,
    });
  };

  return (
    <div className="animate-rise" data-testid="visitor-sample">
      <p className="flex flex-wrap items-baseline gap-x-4 text-lg text-muted">
        <span>
          {tavola.model.brand} {tavola.model.name}
        </span>
        <span aria-hidden className="text-line-strong">
          /
        </span>
        <span>
          Tavola <span className="tabular text-text">{tavola.number}</span>
        </span>
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-balance sm:text-4xl">{tavola.nameIt}</h1>
      <p className="mt-1 text-lg text-muted">{tavola.nameEn}</p>
      <p className="mt-4 max-w-measure text-pretty text-muted">
        A drawing from the Club’s archive, shown with number{' '}
        <span className="tabular text-text">{sample.open.number}</span> open. Members read the Parts
        at every number. A member?{' '}
        <SignInLink className="text-accent-ink underline underline-offset-4">Sign in</SignInLink>
      </p>

      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_var(--width-part-panel)]">
        <div className="drawing-column">
          <DrawingViewer
            className="drawing-beside"
            scan={sampleDrawing(sample)}
            alt={`Tavola ${tavola.number} — ${tavola.nameEn}`}
            overlay={
              <MarkLayer
                positions={positions}
                selectedPositionId={selected?.id ?? null}
                selectedMarkId={selected?.marks.find((mark) => mark.id === markId)?.id ?? null}
                lit={lit}
                onSelect={select}
              />
            }
          />
        </div>

        <div className="flex flex-col gap-10" data-testid="part-panel">
          {selected === null ? null : locked ? (
            <LockedNumber number={selected.number} />
          ) : (
            <OpenNumber number={sample.open.number} listings={sample.open.listings} />
          )}
          {locked && open && (
            <Button variant="outline" className="self-start" onClick={() => select(open, null)}>
              Back to number <span className="tabular">{open.number}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The heading both columns open with: the number, on the Mark's own blue, as members see it. */
function NumberHeading({ number }: { number: string }) {
  return (
    <>
      <h2 id="position" className="label">
        Position
      </h2>
      <p
        className="tabular mt-2 w-fit rounded-md bg-mark px-3 py-1 text-4xl text-mark-contrast"
        data-testid="selected-position"
      >
        {number}
      </p>
    </>
  );
}

/** What the factory listed at the open number: the five things it printed, and nothing else. */
function OpenNumber({ number, listings }: { number: string; listings: VisitorListing[] }) {
  return (
    <section aria-labelledby="position" aria-live="polite" data-testid="part-reading">
      <NumberHeading number={number} />
      {listings.length === 0 ? (
        <p className="mt-8 max-w-measure text-pretty text-muted">
          Nothing is recorded at this number yet.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-10">
          {listings.map((listing, index) => (
            <li key={index} className="listed" data-testid="listing">
              <ListedPart listing={listing} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ListedPart({ listing }: { listing: VisitorListing }) {
  const heading = listing.nameEn ?? listing.nameIt;
  const beneath = listing.nameEn ? listing.nameIt : null;

  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-lg font-semibold text-pretty">{heading}</h3>
        {listing.quantityPerCar !== null && (
          <p className="shrink-0 text-sm text-muted">
            <span className="sr-only">Quantity </span>
            <span className="tabular">×{listing.quantityPerCar}</span> per car
          </p>
        )}
      </div>
      {beneath && (
        <p lang="it" className="mt-1 text-pretty text-muted">
          {beneath}
        </p>
      )}
      <dl className="mt-5 border-t border-line pt-4">
        <dt className="label">Catalog number</dt>
        <dd className="tabular text-lg" data-testid="catalog-number">
          {listing.catalogNumber ?? <span className="text-sm text-faint">None printed</span>}
        </dd>
      </dl>
      {listing.catalogNote && (
        <div className="transcription mt-6" data-testid="catalog-note">
          <h4 className="label">From the factory catalog</h4>
          <p lang="it" className="mt-2 text-sm text-pretty">
            {listing.catalogNote}
          </p>
        </div>
      )}
    </>
  );
}

/**
 * **A number that is drawn and locked.** What it holds is the members' — so this says that
 * members read it, and the one thing to do about that is ask to join.
 */
function LockedNumber({ number }: { number: string }) {
  return (
    <section aria-labelledby="position" aria-live="polite" data-testid="locked-number">
      <NumberHeading number={number} />
      <p className="mt-8 text-2xl font-semibold text-balance">Members read the Parts here.</p>
      <p className="mt-3 max-w-measure text-pretty text-muted">
        Members see the Parts at every number on every drawing, with what the Club knows about each:
        notes, photographs, where a part fits and what replaces it.
      </p>
      <Button asChild variant="primary" size="lg" className="mt-8">
        <Link to="/" hash="ask-to-join" data-testid="way-to-join">
          Ask the Club to join
        </Link>
      </Button>
    </section>
  );
}
