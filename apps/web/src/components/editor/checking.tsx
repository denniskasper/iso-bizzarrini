import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { MachineTranslationTag } from '@/components/machine-translation';
import { Button } from '@/components/ui/button';
import { Refusal, TextArea } from '@/components/ui/field';
import {
  api,
  refusalText,
  type CheckedListing,
  type Position,
  type QuarterTurn,
  type ReadingDoubt,
  type TableSheet,
  type TavolaCheckingResponse,
} from '@/lib/api';
import { useRereadListings } from '@/lib/parts';
import { cn } from '@/lib/utils';

/**
 * **Checking a machine-read Tavola** (issue #34, ADR 0017) — the pieces the Tavola page adds for
 * an Editor while a Tavola is Unchecked. The drawing, its Marks and the marking tool are the
 * page's own; what is here is the evidence beside them: the factory's table sheets with the rows
 * read off each, and what the read command was unsure of.
 *
 * Nothing here has to be settled before publishing. A doubt is a place to look, not a gate; one an
 * Editor has looked at can be cleared, or rewritten in their words, so the band holds only what
 * still needs looking at (issue #56).
 */

/** What the read command left on the Tavola. An Editor's alone, so only asked for by one. */
export function useTavolaChecking(tavolaId: string, enabled: boolean) {
  return useQuery({
    queryKey: checkingKey(tavolaId),
    queryFn: () => api.tavolaChecking(tavolaId),
    enabled,
  });
}

function checkingKey(tavolaId: string) {
  return ['tavola-checking', tavolaId] as const;
}

/**
 * Which Reading method read the Tavola, and every doubt, each a way to the row or the number it
 * is about. Inside the Unchecked band, because it is what an Editor checks first.
 */
export function ReadingDoubts({
  tavolaId,
  checking,
  positions,
  onDoubt,
}: {
  tavolaId: string;
  checking: TavolaCheckingResponse;
  positions: Position[];
  onDoubt: (doubt: ReadingDoubt) => void;
}) {
  const numberOf = new Map(positions.map((position) => [position.id, position.number]));
  const { doubts, readingMethod } = checking;

  return (
    <div className="flex flex-col gap-4" data-testid="reading-doubts">
      {readingMethod && (
        <p className="text-sm text-muted" data-testid="reading-method">
          Read by <span className="text-text">{readingMethod}</span>.
        </p>
      )}

      {doubts.length === 0 ? (
        <p className="text-sm text-muted">No doubts are left to look at.</p>
      ) : (
        <div>
          <h3 className="text-base">
            {doubts.length === 1 ? '1 doubt' : `${doubts.length} doubts`}
          </h3>
          <p className="mt-1 text-sm text-pretty text-muted">
            Select one to go to it. Clear it once you have looked; rewrite it to leave a note for
            the next Editor.
          </p>
          <ul className="mt-2 border-t border-line">
            {doubts.map((doubt) => (
              <DoubtRow
                key={doubt.id}
                tavolaId={tavolaId}
                doubt={doubt}
                number={doubt.positionId ? numberOf.get(doubt.positionId) : undefined}
                onFollow={() => onDoubt(doubt)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * One doubt: the number and the words, which together are the way to the row, and the two things
 * an Editor who has looked at it can do. Both are quiet, because Publish is the band's one
 * action; clearing is a single press, as taking a Mark off is.
 */
function DoubtRow({
  tavolaId,
  doubt,
  number,
  onFollow,
}: {
  tavolaId: string;
  doubt: ReadingDoubt;
  number: string | undefined;
  onFollow: () => void;
}) {
  const queryClient = useQueryClient();
  const [rewriting, setRewriting] = useState(false);
  const [reason, setReason] = useState(doubt.reason);
  const settled = () => queryClient.invalidateQueries({ queryKey: checkingKey(tavolaId) });

  const rewrite = useMutation({
    mutationFn: () => api.rewriteDoubt(doubt.id, reason),
    onSuccess: async () => {
      await settled();
      setRewriting(false);
    },
  });
  const clear = useMutation({ mutationFn: () => api.clearDoubt(doubt.id), onSuccess: settled });
  const failed = rewrite.error ?? clear.error;

  return (
    <li className="border-b border-line" data-testid="reading-doubt">
      {rewriting ? (
        <form
          className="flex flex-col gap-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            rewrite.mutate();
          }}
        >
          <TextArea
            label={number ? `The doubt about ${number}` : 'The doubt'}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            autoFocus
          />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={rewrite.isPending}>
              {rewrite.isPending ? 'Saving…' : 'Save the doubt'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRewriting(false);
                setReason(doubt.reason);
                rewrite.reset();
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2">
          <button
            type="button"
            className="grid min-h-control min-w-0 flex-1 grid-cols-[4rem_minmax(0,1fr)] items-baseline gap-4 py-2 text-left hover:bg-surface-raised"
            onClick={onFollow}
            title="Go to this number on the drawing, and its row below"
          >
            <span className="tabular text-lg">{number ?? '–'}</span>
            <span className="text-sm text-pretty">{doubt.reason}</span>
          </button>
          <span className="flex">
            <Button
              variant="ghost"
              onClick={() => setRewriting(true)}
              title="Say in your own words what is still open here, for the next Editor"
            >
              Rewrite
            </Button>
            <Button
              variant="ghost"
              disabled={clear.isPending}
              onClick={() => clear.mutate()}
              title="You have looked at it: take it off the list. Nothing else changes"
            >
              {clear.isPending ? 'Clearing…' : 'Clear'}
            </Button>
          </span>
        </div>
      )}
      {failed && (
        <div className="pb-3">
          <Refusal>{refusalText(failed)}</Refusal>
        </div>
      )}
    </li>
  );
}

/**
 * **The factory's table sheets, each beside the rows read off it.** The sheet keeps the larger
 * share and stays in view while the rows beside it scroll, because the rows are what is being
 * checked against it and not the other way round.
 */
export function CheckingSheets({
  tavolaId,
  tableSheets,
  checking,
  positions,
  highlighted,
}: {
  tavolaId: string;
  tableSheets: TableSheet[];
  checking: TavolaCheckingResponse;
  positions: Position[];
  /**
   * The row a doubt was followed to, brought into view and held lit. An object, so following the
   * same doubt again brings it back into view again.
   */
  highlighted: { listingId: string } | null;
}) {
  const doubted = new Set(checking.doubts.flatMap((doubt) => doubt.listingId ?? []));
  const numberOf = new Map(positions.map((position) => [position.id, position.number]));
  const bySheet = (sheet: number | null) =>
    checking.listings.filter((listing) => listing.tableSheet === sheet);
  const byHand = bySheet(null);

  const rows = (listings: CheckedListing[]) => (
    <CheckedRows
      tavolaId={tavolaId}
      listings={listings}
      numberOf={numberOf}
      doubted={doubted}
      highlighted={highlighted}
    />
  );

  return (
    <section aria-labelledby="checking-sheets" data-testid="checking-sheets">
      <h2 id="checking-sheets" className="text-2xl">
        The factory’s table sheets
      </h2>
      <p className="mt-2 max-w-measure text-pretty text-muted">
        Each sheet beside the rows read from it. Correct a row from the drawing, or flip whether it
        is drawn here.
      </p>

      {tableSheets.length === 0 && (
        <p className="mt-6 max-w-measure text-pretty text-faint">
          This Tavola has no table sheets to compare with.
        </p>
      )}

      {tableSheets.map((sheet) => (
        <div
          key={sheet.sheet}
          className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
          data-testid="checking-sheet"
          data-sheet={sheet.sheet}
        >
          <figure className="lg:sticky lg:top-[calc(var(--chrome-height,0px)+1.5rem)]">
            <a href={sheet.url} target="_blank" rel="noreferrer" className="block">
              <img
                src={sheet.url}
                width={sheet.width}
                height={sheet.height}
                alt={`Table sheet ${sheet.sheet}`}
                className="h-auto w-full border border-line bg-paper"
              />
            </a>
            <figcaption className="mt-2 text-sm text-muted">
              Sheet {sheet.sheet}. Opens full size.
            </figcaption>
          </figure>
          {rows(bySheet(sheet.sheet))}
        </div>
      ))}

      {byHand.length > 0 && (
        <div className="mt-10">
          <h3 className="label">Recorded by hand</h3>
          <div className="mt-4 max-w-3xl">{rows(byHand)}</div>
        </div>
      )}
    </section>
  );
}

function CheckedRows({
  tavolaId,
  listings,
  numberOf,
  doubted,
  highlighted,
}: {
  tavolaId: string;
  listings: CheckedListing[];
  numberOf: Map<string, string>;
  doubted: Set<string>;
  highlighted: { listingId: string } | null;
}) {
  if (listings.length === 0) {
    return <p className="text-pretty text-faint">Nothing was read from this sheet.</p>;
  }

  return (
    <ul className="border-t border-line">
      {listings.map((listing) => (
        <CheckedRow
          key={listing.id}
          tavolaId={tavolaId}
          listing={listing}
          number={listing.positionId ? (numberOf.get(listing.positionId) ?? null) : null}
          inDoubt={doubted.has(listing.id)}
          followed={listing.id === highlighted?.listingId ? highlighted : null}
        />
      ))}
    </ul>
  );
}

/**
 * One row as read: the number, what it is ordered by, how many, the name — and whether the
 * number points at it. A row in doubt wears the dashed edge every Unchecked thing wears; a row one
 * Reading hesitated over carries its Reading note, quietly.
 */
function CheckedRow({
  tavolaId,
  listing,
  number,
  inDoubt,
  followed,
}: {
  tavolaId: string;
  listing: CheckedListing;
  number: string | null;
  inDoubt: boolean;
  followed: object | null;
}) {
  const row = useRef<HTMLLIElement>(null);
  const queryClient = useQueryClient();
  const reread = useRereadListings(tavolaId, listing.positionId ?? undefined);

  useEffect(() => {
    if (followed) {
      row.current?.scrollIntoView({ block: 'center' });
      row.current?.focus({ preventScroll: true });
    }
  }, [followed]);

  const flip = useMutation({
    mutationFn: () =>
      api.correctListing(listing.id, {
        positionId: listing.positionId,
        quantityPerCar: listing.quantityPerCar,
        drawn: !listing.drawn,
      }),
    onSuccess: () =>
      Promise.all([queryClient.invalidateQueries({ queryKey: checkingKey(tavolaId) }), reread()]),
  });

  return (
    <li
      ref={row}
      tabIndex={-1}
      data-testid="checked-row"
      data-in-doubt={inDoubt}
      className={cn(
        'grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line py-3 outline-none',
        inDoubt && 'checked-row-in-doubt',
        followed && 'bg-surface-sunken',
      )}
    >
      <span className="tabular text-lg">{number ?? '–'}</span>
      <span className="flex min-w-0 flex-col">
        {/* The Italian first: it is what the factory printed, and what is being checked. */}
        <span lang="it" className="text-pretty">
          {listing.part.nameIt ?? listing.part.nameEn}
        </span>
        {listing.part.nameIt !== null && listing.part.nameEn !== null && (
          <span className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted">
            {listing.part.nameEn}
            {listing.part.nameEnMachineTranslated && <MachineTranslationTag />}
          </span>
        )}
        <span className="text-sm text-muted">
          <span className="tabular">{listing.part.catalogNumber ?? 'No Catalog Number'}</span>
          {listing.quantityPerCar !== null && (
            <span className="tabular">, {listing.quantityPerCar} per car</span>
          )}
        </span>
        {/* Worth a glance and no more: a note, never a doubt, so it wears no dashed edge. */}
        {listing.readingNote && (
          <span className="mt-1 text-xs text-pretty text-faint" data-testid="reading-note">
            {listing.readingNote}.
          </span>
        )}
      </span>
      <Button
        variant="ghost"
        aria-pressed={listing.drawn}
        disabled={flip.isPending}
        onClick={() => flip.mutate()}
        title={
          listing.drawn
            ? 'Drawn: the drawing shows this part at its number. Press if it does not'
            : 'Not drawn: listed, but not shown on the drawing. Press if it is'
        }
      >
        {listing.drawn ? 'Drawn' : 'Not drawn'}
      </Button>
      {flip.isError && (
        <div className="col-span-3">
          <Refusal>{refusalText(flip.error)}</Refusal>
        </div>
      )}
    </li>
  );
}

/**
 * The factory's table sheets on a Published Tavola, for anybody reading it: the evidence the
 * list beside the drawing was taken from, as private as the drawing itself.
 */
export function TableSheets({ tableSheets }: { tableSheets: TableSheet[] }) {
  return (
    <section aria-labelledby="table-sheets" data-testid="table-sheets">
      <h2 id="table-sheets" className="label">
        The factory’s table sheets
      </h2>
      <ul className="mt-4 flex flex-wrap gap-6">
        {tableSheets.map((sheet) => (
          <li key={sheet.sheet}>
            <a
              href={sheet.url}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col gap-2 text-sm text-muted hover:text-text"
            >
              <img
                src={sheet.url}
                width={sheet.width}
                height={sheet.height}
                alt=""
                loading="lazy"
                className="h-48 w-auto border border-line bg-paper"
              />
              Sheet {sheet.sheet}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Turning a sheet that was scanned on its side, a quarter at a time. The Marks turn with it, so
 * nothing has to be marked again, and the upload stays as it arrived.
 */
export function ScanTurn({ tavolaId }: { tavolaId: string }) {
  const queryClient = useQueryClient();
  const turn = useMutation({
    mutationFn: (direction: QuarterTurn) => api.turnScan(tavolaId, direction),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tavola', tavolaId] }),
  });

  return (
    <div className="flex flex-col gap-3" data-testid="scan-turn">
      <div className="flex flex-wrap gap-3">
        <Button disabled={turn.isPending} onClick={() => turn.mutate('anticlockwise')}>
          Turn anticlockwise
        </Button>
        <Button disabled={turn.isPending} onClick={() => turn.mutate('clockwise')}>
          Turn clockwise
        </Button>
      </div>
      {turn.isError && <Refusal>{refusalText(turn.error)}</Refusal>}
    </div>
  );
}
