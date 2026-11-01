import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { ListingFields } from '@/components/editor/listing-fields';
import { PartCorrection } from '@/components/editor/part-correction';
import { NO_PART, PartFields } from '@/components/editor/part-fields';
import { PartRecordEditor } from '@/components/editor/part-record-editor';
import { PhotographEditor } from '@/components/editor/photograph-editor';
import { PartPhotographs, PhotographStrip } from '@/components/parts/part-photographs';
import { Button } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import {
  ApiError,
  type CatalogNumberConflict,
  type Contribution,
  type ContributionSubject,
  type Part,
  type PartInFull,
  type WaitingContribution,
} from '@/lib/api';
import { useReviewAction, type ReviewAction } from '@/lib/review';
import { authorOf, writtenOn } from '@/lib/contributions';

/**
 * **One Contribution, beside the record it is about** (story 116) — the member's page on the
 * left and the archive's on the right, the way a factory catalog faces a drawing with its table.
 *
 * Everything an Editor can do to it is here, and the screen is arranged around the fact that
 * there is no diff to apply (spec, Out of Scope). A good correction is made on the right, with
 * the same tools the archive has everywhere else, while the words that prompted it stay in view
 * on the left. Deciding is last and is the one teal button on the screen: by the time it is
 * pressed, whatever was worth keeping is already in the record.
 */
export function Reviewing({ waiting }: { waiting: WaitingContribution }) {
  const { contribution, subject } = waiting;
  const act = useReviewAction();
  const refusalAbout = (kind: ReviewAction['kind']) =>
    act.isError && act.variables.kind === kind ? act.error.message : null;

  return (
    <article
      className="grid items-start gap-x-12 gap-y-10 lg:grid-cols-2 lg:grid-rows-[auto_1fr]"
      data-testid="reviewing"
      aria-label={`What ${authorOf(contribution)} wrote`}
    >
      <FromTheMember
        contribution={contribution}
        canMove={subject.kind === 'part'}
        busy={act.isPending}
        // Said where the press was: a refusal about a photograph belongs beside the photograph.
        refusal={refusalAbout('promote-photograph')}
        onMove={(photographId) => act.mutate({ kind: 'promote-photograph', photographId })}
      />

      {/*
       * **Second in the markup and beside the member's words on a wide screen.** On a phone
       * there is no beside, and the order has to be the order of the job: what they wrote, what
       * the archive says, and only then the decision — never a Publish button above the record
       * it is being judged against.
       */}
      <section
        aria-labelledby="record"
        className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
        data-testid="record-now"
      >
        <h2 id="record" className="label">
          What the archive says now
        </h2>
        {subject.kind === 'part' ? (
          <PartNow subject={subject} />
        ) : (
          <NumberNow
            subject={subject}
            busy={act.isPending}
            error={act.isError && act.variables.kind === 'record-part' ? act.error : null}
            onRecord={(part) =>
              act.mutate({ kind: 'record-part', contributionId: contribution.id, part })
            }
            onReset={() => act.reset()}
          />
        )}
      </section>

      <Decision
        contribution={contribution}
        busy={act.isPending}
        refusal={refusalAbout('decide')}
        onDecide={(decision) =>
          act.mutate({ kind: 'decide', contributionId: contribution.id, decision })
        }
      />
    </article>
  );
}

/**
 * The member's words, set as a member's are everywhere: under their name and the day they wrote
 * (story 89), with their own line breaks. Nothing here can be edited. It is theirs.
 */
function FromTheMember({
  contribution,
  canMove,
  busy,
  refusal,
  onMove,
}: {
  contribution: Contribution;
  /** Whether there is a Part for a photograph to go onto yet. */
  canMove: boolean;
  busy: boolean;
  refusal: string | null;
  onMove: (photographId: string) => void;
}) {
  const author = authorOf(contribution);

  return (
    <section aria-labelledby="from-the-member">
      <h2 id="from-the-member" className="label">
        From a member
      </h2>
      <p className="mt-4 text-xl font-semibold text-pretty">{author}</p>
      <p className="mt-1 text-sm text-faint">
        <time dateTime={contribution.writtenAt}>{writtenOn(contribution.writtenAt)}</time>
        {contribution.mine && ' — you wrote this yourself'}
      </p>
      {contribution.correction && <p className="tag mt-3">Says the record is wrong</p>}

      <p
        className="mt-5 max-w-measure text-lg text-pretty whitespace-pre-line"
        data-testid="contribution-text"
      >
        {contribution.text}
      </p>

      {contribution.photographs.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <h3 className="label">Their photographs</h3>
          <PhotographStrip photographs={contribution.photographs} of={`what ${author} wrote`} />
          {/*
           * **Moving one is said in a sentence before it is offered as a button** (story 119),
           * because it is not undone from here: the picture leaves what the member sent and is
           * the Part's from then on, whatever is decided about the words.
           */}
          {canMove ? (
            <>
              <p className="mt-4 max-w-measure text-sm text-pretty text-muted">
                A good picture belongs on the part itself. Moving one takes it out of what {author}{' '}
                sent and puts it last among the part’s own photographs, where every member sees it.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {contribution.photographs.map((photograph, index) => (
                  <li key={photograph.id}>
                    <Button disabled={busy} onClick={() => onMove(photograph.id)}>
                      {contribution.photographs.length === 1
                        ? 'Move it onto the part'
                        : `Move photograph ${index + 1} onto the part`}
                    </Button>
                  </li>
                ))}
              </ul>
              {refusal !== null && (
                <div className="mt-3">
                  <Refusal>{refusal}</Refusal>
                </div>
              )}
            </>
          ) : (
            <p className="mt-4 max-w-measure text-sm text-pretty text-muted">
              There is no part here for these to go onto yet. Record the part, and they can be moved
              onto it.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Publish or discard, **and decided once.**
 *
 * Publishing is the dominant action because it is what most of what members send deserves.
 * Discarding asks twice: it is the one press here that nobody can take back, and its author is
 * never told — so the sentence beside it says what it actually means for what they wrote.
 */
function Decision({
  contribution,
  busy,
  refusal,
  onDecide,
}: {
  contribution: Contribution;
  busy: boolean;
  refusal: string | null;
  onDecide: (decision: 'publish' | 'discard') => void;
}) {
  const [discarding, setDiscarding] = useState(false);

  return (
    <div className="border-t border-line-strong pt-6" data-testid="decision">
      <p className="max-w-measure text-sm text-pretty text-muted">
        {contribution.correction
          ? 'If you have corrected the record, there may be nothing left worth publishing beside it: discard the report. Publish it if it says something the record still does not.'
          : 'Published, every member reads this under the part, with the name and date above. Anything that belongs in the record itself is better put there first.'}
      </p>

      {refusal !== null && (
        <div className="mt-4">
          <Refusal>{refusal}</Refusal>
        </div>
      )}

      {discarding ? (
        <div className="mt-5">
          <p className="max-w-measure text-sm text-pretty">
            Discarded, nobody reads this again — its author included — and it cannot be brought
            back.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button disabled={busy} onClick={() => onDecide('discard')}>
              Yes, discard it
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setDiscarding(false)}>
              Keep it waiting
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" disabled={busy} onClick={() => onDecide('publish')}>
            Publish
          </Button>
          <Button variant="ghost" size="lg" disabled={busy} onClick={() => setDiscarding(true)}>
            Discard
          </Button>
        </div>
      )}
    </div>
  );
}

/** Which of the Part's three editors is open. One at a time, as under a drawing. */
type Correcting = 'part' | 'record' | 'photographs' | null;

/**
 * The Part as every member is reading it at this moment, and the way to change that (story 118).
 *
 * **Read first, edited second.** The record is laid out as it is beside a drawing so that an
 * Editor compares like with like; the three editors are the archive's own, opened in place, and
 * what they save is what this panel then shows.
 */
function PartNow({ subject }: { subject: Extract<ContributionSubject, { kind: 'part' }> }) {
  const { part, listedOn } = subject;
  const [correcting, setCorrecting] = useState<Correcting>(null);
  const heading = part.nameEn ?? part.nameIt ?? 'This part';

  return (
    <div className="mt-4">
      <h3 className="text-xl text-pretty">{heading}</h3>
      {part.nameEn && part.nameIt && <p className="mt-1 text-pretty text-muted">{part.nameIt}</p>}

      <PartPhotographs photographs={part.photographs} partName={heading} />

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

      <Recorded label="Description">{part.description}</Recorded>
      <Recorded label="Dimensions" mono>
        {part.dimensions}
      </Recorded>
      <Recorded label="Material and finish">{part.materialFinish}</Recorded>
      {part.catalogNote !== null && (
        <div className="transcription mt-5">
          <h4 className="label">From the factory catalog</h4>
          <p className="mt-2 text-sm text-pretty">{part.catalogNote}</p>
        </div>
      )}
      <Recorded label="The club’s note">{part.note}</Recorded>

      <p className="mt-5 text-sm text-pretty text-faint">{alsoRecorded(part)}</p>

      {listedOn.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <h4 className="label">Listed on</h4>
          <ul className="mt-2 flex flex-col gap-1">
            {listedOn.map((sheet) => (
              <li key={sheet.tavolaId} className="text-sm">
                <Link
                  to="/tavole/$tavolaId"
                  params={{ tavolaId: sheet.tavolaId }}
                  className="inline-flex min-h-control items-center text-accent-ink underline-offset-4 hover:underline"
                >
                  <span className="tabular">Tavola {sheet.tavolaNumber}</span>
                  <span className="ml-2">{sheet.nameEn}</span>
                </Link>
                <span className="ml-2 text-faint">
                  {sheet.model.brand} {sheet.model.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-6">
        <Choice at="part" open={correcting} onOpen={setCorrecting}>
          Correct this part
        </Choice>
        <Choice at="record" open={correcting} onOpen={setCorrecting}>
          What fits it and replaces it
        </Choice>
        <Choice at="photographs" open={correcting} onOpen={setCorrecting}>
          Its photographs
        </Choice>
      </div>

      {correcting === 'part' && (
        <PartCorrection partId={part.id} onDone={() => setCorrecting(null)} />
      )}
      {correcting === 'record' && (
        <div className="mt-6 border-t border-line pt-6">
          <PartRecordEditor part={part} />
        </div>
      )}
      {correcting === 'photographs' && (
        <div className="mt-6 border-t border-line pt-6">
          <PhotographEditor part={part} />
        </div>
      )}
    </div>
  );
}

function Choice({
  at,
  open,
  onOpen,
  children,
}: {
  at: Exclude<Correcting, null>;
  open: Correcting;
  onOpen: (next: Correcting) => void;
  children: ReactNode;
}) {
  return (
    <Button aria-expanded={open === at} onClick={() => onOpen(open === at ? null : at)}>
      {children}
    </Button>
  );
}

/** One prose field of the record, absent entirely when nobody has recorded it. */
function Recorded({
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
      <h4 className="label">{label}</h4>
      <p className={mono ? 'tabular mt-1 text-base' : 'mt-1 max-w-measure text-pretty'}>
        {children}
      </p>
    </div>
  );
}

/** The three lists, as counts: enough to know whether what the member says is already there. */
function alsoRecorded(part: PartInFull): string {
  const count = (many: number, one: string, several: string) =>
    many === 0 ? null : `${many} ${many === 1 ? one : several}`;

  const held = [
    count(part.fitments.length, 'car it fits', 'cars it fits'),
    count(part.equivalents.length, 'equivalent', 'equivalents'),
    count(part.sources.length, 'place it was seen for sale', 'places it was seen for sale'),
  ].filter((each) => each !== null);

  return held.length === 0
    ? 'No fitments, equivalents or sources are recorded for it.'
    : `Also recorded: ${held.join(', ')}.`;
}

/**
 * A number, and what sits at it — which is usually nothing, and that is why the member wrote.
 *
 * **The gap is filled from here** (story 120): the Editor records the Part from what the member
 * said, at the number they said it about, and the Contribution becomes that Part's. The form is
 * the one under every drawing, with the Position already decided.
 */
function NumberNow({
  subject,
  busy,
  error,
  onRecord,
  onReset,
}: {
  subject: Extract<ContributionSubject, { kind: 'position' }>;
  busy: boolean;
  error: Error | null;
  onRecord: (part: Extract<ReviewAction, { kind: 'record-part' }>['part']) => void;
  onReset: () => void;
}) {
  const { position, tavola, listings } = subject;
  const [recording, setRecording] = useState(false);
  const [part, setPart] = useState(NO_PART);
  const [quantity, setQuantity] = useState('');
  const [drawn, setDrawn] = useState(true);

  const asTyped = () => ({ quantityPerCar: quantity === '' ? null : Number(quantity), drawn });
  const clash = catalogNumberClash(error);

  return (
    <div className="mt-4">
      <p className="tabular w-fit rounded-md bg-mark px-3 py-1 text-4xl text-mark-contrast">
        {position.number}
      </p>
      <p className="tag mt-3">
        {tavola.model.brand} {tavola.model.name}, Tavola{' '}
        <span className="tabular">{tavola.number}</span>, {tavola.nameEn}
      </p>

      {listings.length === 0 ? (
        <p className="mt-5 max-w-measure text-pretty text-muted">
          Nothing is recorded at this position. The number is on the sheet; what sits at it has not
          been written down.
        </p>
      ) : (
        <>
          <p className="mt-5 max-w-measure text-pretty text-muted">
            Already recorded at this position:
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {listings.map((listing) => (
              <li key={listing.id} className="listed text-sm">
                {listing.part.nameEn ?? listing.part.nameIt}
                {listing.part.catalogNumber !== null && (
                  <span className="tabular ml-3 text-muted">{listing.part.catalogNumber}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-3 text-sm">
        <Link
          to="/tavole/$tavolaId"
          params={{ tavolaId: tavola.id }}
          search={{ position: position.number }}
          className="inline-flex min-h-control items-center text-accent-ink underline-offset-4 hover:underline"
        >
          Open the drawing at this position
        </Link>
      </p>

      {recording ? (
        <form
          className="editor-panel mt-4 flex animate-rise flex-col gap-6"
          data-testid="record-from-contribution"
          onSubmit={(event) => {
            event.preventDefault();
            onRecord({ part, ...asTyped() });
          }}
        >
          <p className="max-w-measure text-sm text-pretty text-muted">
            Recorded from what the member wrote, in the archive’s words. Their Contribution then
            belongs to this part, and is still yours to publish or discard.
          </p>

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
            <div
              role="alert"
              className="border border-line-strong p-6"
              data-testid="catalog-number-clash"
            >
              <h4 className="label">That number is already recorded</h4>
              <p className="mt-3 max-w-measure text-pretty">
                <span className="tabular">{clash.catalogNumber}</span> belongs to{' '}
                <strong className="font-semibold">{clash.nameEn ?? clash.nameIt}</strong>. Two parts
                never share one: list that part here, or correct the number.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => onRecord({ partId: clash.id, ...asTyped() })}
                >
                  List that part here
                </Button>
                <Button type="button" variant="ghost" onClick={onReset}>
                  Correct the number
                </Button>
              </div>
            </div>
          ) : (
            error !== null && <Refusal>{error.message}</Refusal>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? 'Recording…' : `Record this part at ${position.number}`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onReset();
                setRecording(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4">
          <Button onClick={() => setRecording(true)}>Record the part from this</Button>
        </div>
      )}
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
