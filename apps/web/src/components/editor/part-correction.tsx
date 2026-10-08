import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PartFields, partAsTyped } from '@/components/editor/part-fields';
import { Button } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import {
  ApiError,
  api,
  type CatalogNumberConflict,
  type ListedOn,
  type NewPartRequest,
  type Part,
} from '@/lib/api';
import { useRereadPart } from '@/lib/parts';

/**
 * Correcting the Part itself — **the half of ticket 06 that was a one-way door.**
 *
 * Everything about this panel follows from one fact: a Part is a thing in its own right (ADR
 * 0001), so correcting it corrects it at every number it sits at, on every sheet, including the
 * ones the Editor is not looking at. From a screen showing one Position that is invisible, which
 * is why the reach is printed at the top in words and in the sheets' own numbers, **before** any
 * field — an Editor should never learn how far a change went by finding out afterwards.
 *
 * A Catalog Number typed here into one another Part holds is refused exactly as it is when a Part
 * is being recorded, and for the same reason. What it is *not* offered is a merge: folding two
 * Parts that both already exist into one is a different operation with questions this does not
 * answer, and a button that pretended otherwise would be the archive promising something it
 * cannot do.
 */
export function PartCorrection({
  partId,
  /** What the Editor had typed when the archive sent them here. Offered, never applied. */
  offered,
  onDone,
}: {
  partId: string;
  offered?: Partial<NewPartRequest>;
  onDone: () => void;
}) {
  const held = useQuery({ queryKey: ['part', partId], queryFn: () => api.part(partId) });

  if (held.isPending) {
    return <p className="mt-6 text-sm text-muted">Reading the part…</p>;
  }
  if (held.isError) {
    return <Refusal>{held.error.message}</Refusal>;
  }

  /**
   * **The form is mounted with the Part in it and never re-seeded from a later read.** An Editor
   * halfway through a correction whose fields reset under them because something refetched has
   * lost work, so what the archive currently holds fills the boxes exactly once — at mount, keyed
   * by the Part, which is what makes a *different* Part a different form rather than the same one
   * with different values.
   */
  return (
    <CorrectionForm
      key={partId}
      partId={partId}
      part={held.data.part}
      listedOn={held.data.listedOn}
      offered={offered}
      onDone={onDone}
    />
  );
}

function CorrectionForm({
  partId,
  part,
  listedOn,
  offered,
  onDone,
}: {
  partId: string;
  part: Part;
  listedOn: ListedOn[];
  offered?: Partial<NewPartRequest>;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const rereadEveryPosition = useRereadPart();
  const [typed, setTyped] = useState(() => partAsTyped(part));

  const correct = useMutation({
    mutationFn: (part: NewPartRequest) => api.correctPart(partId, part),
    onSuccess: async () => {
      // Every Position in this browser, because the Part is on all of them: the panel under
      // Tavola 2 has just changed what a member reads under Tavola 10.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['part', partId] }),
        queryClient.invalidateQueries({ queryKey: ['tavola-listings'] }),
        // The lookup too, since a name or a number just changed under whatever it last found.
        queryClient.invalidateQueries({ queryKey: ['part-lookup'] }),
        rereadEveryPosition(),
      ]);
      onDone();
    },
  });

  const remove = useMutation({
    mutationFn: () => api.removePart(partId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tavola-listings'] }),
        queryClient.invalidateQueries({ queryKey: ['part-lookup'] }),
        rereadEveryPosition(),
      ]);
      onDone();
    },
  });

  const clash = catalogNumberClash(correct.error);

  return (
    <form
      className="mt-6 flex flex-col gap-6 border-t border-line pt-6"
      onSubmit={(event) => {
        event.preventDefault();
        correct.mutate(typed);
      }}
    >
      <Reach listedOn={listedOn} />

      <PartFields part={typed} onChange={setTyped} offered={offered} />

      {clash ? (
        <NumberBelongsToAnother part={clash} />
      ) : (
        correct.isError && <Refusal>{correct.error.message}</Refusal>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={correct.isPending}>
          {correct.isPending ? 'Correcting…' : 'Correct this part'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>

      <RemovePart
        listedOn={listedOn}
        busy={remove.isPending}
        refusal={remove.error?.message ?? null}
        onRemove={() => remove.mutate()}
      />
    </form>
  );
}

/**
 * **How far this correction goes**, said before anything can be typed.
 *
 * The sheets are named rather than counted alone, because "three tavole" and "Tavola 2, Tavola
 * 10 and Tavola 34" are different amounts of warning — the second is the one an Editor can check
 * against what they meant to change. Set as the printed index this archive sets everything in:
 * the numbers in the mono face, because they are numbers the factory printed.
 */
function Reach({ listedOn }: { listedOn: ListedOn[] }) {
  if (listedOn.length === 0) {
    return (
      <p className="max-w-measure text-sm text-pretty text-muted" data-testid="part-reach">
        This part is <strong className="font-semibold">listed on no drawing</strong>. Nothing in the
        archive points at it until it is listed somewhere.
      </p>
    );
  }

  return (
    <div data-testid="part-reach">
      <p className="max-w-measure text-sm text-pretty text-muted">
        The same part on two drawings stays one part, so correcting it here changes{' '}
        <strong className="font-semibold">
          {listedOn.length === 1 ? 'the one drawing' : `all ${listedOn.length} drawings`}
        </strong>{' '}
        it is listed on:
      </p>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
        {listedOn.map((sheet) => (
          <li key={sheet.tavolaId} className="text-sm text-faint">
            <span className="tabular">Tavola {sheet.tavolaNumber}</span> · {sheet.nameEn}
            <span className="ml-2 text-xs">
              {sheet.model.brand} {sheet.model.name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The number typed belongs to something else.
 *
 * **Correct the number, and that is the only way out** — which is a narrower fork than the one
 * recording a Part offers, deliberately. There, merging means listing the existing Part *here*,
 * which is one press and loses nothing. Here both Parts already exist and folding them together
 * is an operation this archive does not have: whose description wins, what becomes of the other's
 * id in links members have already shared. Saying so plainly beats a button that half does it.
 */
function NumberBelongsToAnother({ part }: { part: Part }) {
  return (
    <div role="alert" className="border border-line-strong p-6" data-testid="catalog-number-clash">
      <h4 className="label">That number is already recorded</h4>
      <p className="mt-3 max-w-measure text-pretty">
        <span className="tabular">{part.catalogNumber}</span> belongs to{' '}
        <strong className="font-semibold">{part.nameEn ?? part.nameIt}</strong>. Two parts never
        share one, so correct the number here — or correct it on that part, if this is the one the
        catalog gives it to.
      </p>
    </div>
  );
}

/**
 * Removing the Part, which is **refused while anything still lists it**.
 *
 * The archive would refuse it anyway; what is here is the same rule said before the press rather
 * than after, and the reason for it. Removing a Part removes it from every sheet at once, so the
 * Listings go first and each of those sheets has had to be in front of somebody. A Part listed
 * nowhere has no such cost, and this is the one screen in the archive that can reach one.
 */
function RemovePart({
  listedOn,
  busy,
  refusal,
  onRemove,
}: {
  listedOn: ListedOn[];
  busy: boolean;
  refusal: string | null;
  onRemove: () => void;
}) {
  const [asked, setAsked] = useState(false);

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-6">
      <h4 className="label">Remove this part altogether</h4>

      {listedOn.length > 0 ? (
        <p className="max-w-measure text-sm text-pretty text-faint">
          Not while it is listed. Take it off{' '}
          {listedOn.length === 1 ? 'the drawing above' : 'each of the drawings above'} first — that
          way nothing here quietly removes an evening's work from a sheet you are not looking at.
        </p>
      ) : (
        <>
          <p className="max-w-measure text-sm text-pretty text-faint">
            Nothing lists it, so nothing loses it. Its catalog number goes back to the archive and
            can be typed again.
          </p>
          {asked ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" disabled={busy} onClick={onRemove}>
                {busy ? 'Removing…' : 'Yes, remove it'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAsked(false)}>
                Keep it
              </Button>
            </div>
          ) : (
            <div>
              <Button type="button" variant="ghost" onClick={() => setAsked(true)}>
                Remove this part
              </Button>
            </div>
          )}
          {refusal && <Refusal>{refusal}</Refusal>}
        </>
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
