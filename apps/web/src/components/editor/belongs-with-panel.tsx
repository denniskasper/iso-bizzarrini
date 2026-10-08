import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { PositionChip } from '@/components/positions/position-chip';
import { Button } from '@/components/ui/button';
import { Field, Refusal, Select } from '@/components/ui/field';
import { api, type Position, type Sheet } from '@/lib/api';
import { positionsIn, relatedTo, subAssemblyOf, useRecordSheet } from '@/lib/positions';

/** The picker's one gesture: a number is in what is about to be recorded, or it is not. */
function toggled(chosen: ReadonlySet<string>, positionId: string): ReadonlySet<string> {
  const next = new Set(chosen);
  if (!next.delete(positionId)) {
    next.add(positionId);
  }
  return next;
}

/**
 * Recording what belongs with a number (stories 106–107), on the panel an Editor opened
 * deliberately — below the drawing, ruled off from it, never over it.
 *
 * **Two mechanisms, two sections, and the difference is stated rather than implied.** A
 * Sub-assembly is broad and a Related Position is the narrow pointer at the one part this one
 * works against; an Editor who recorded the first where they meant the second would tell a member
 * to order eleven things.
 *
 * The Sub-assembly is **typed** and the Related Position is **chosen**, and that asymmetry is
 * deliberate. A Sub-assembly's name is whatever the club calls the job — the first *Window
 * Slider* has to be recordable — while the other end of a link is one of the numbers already on
 * this sheet, and there is no such thing as a link to a number the factory never printed.
 *
 * **A Sub-assembly is recorded whole rather than a number at a time.** The ticket's own example
 * is eleven Positions, and eleven select-and-submit cycles is the kind of tool a volunteer stops
 * using — so the sheet's numbers are here to be picked, with the one being read already picked.
 *
 * Every write here answers with the whole sheet, which is what makes this panel and the one
 * beside the drawing agree: a link is symmetric, so recording one changes two numbers, and a
 * Sub-assembly whose last number leaves it stops existing.
 */
export function BelongsWithPanel({
  tavolaId,
  sheet,
  position,
}: {
  tavolaId: string;
  sheet: Sheet;
  /** The number being worked on. There is nothing to record until one has been chosen. */
  position: Position;
}) {
  const record = useRecordSheet(tavolaId);
  const [other, setOther] = useState('');

  const subAssembly = subAssemblyOf(sheet, position);
  const alreadyIn = subAssembly ? positionsIn(sheet, subAssembly.id) : [];
  const related = relatedTo(sheet, position);
  /** A link joins two numbers on this sheet, so neither this one nor one already linked. */
  const linkable = sheet.positions.filter(
    (candidate) =>
      candidate.id !== position.id && !related.some((link) => link.position.id === candidate.id),
  );

  /**
   * The form's two fields, held as **what was typed or picked, or nothing yet**.
   *
   * Nothing rather than a copy of the archive's answer, so that a successful write clears the
   * override and the form falls back to what the sheet now says. A copy taken on mount would go
   * stale the moment the write it caused came back, and this panel stays mounted through it.
   */
  const [typedName, setTypedName] = useState<string | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
  const name = typedName ?? subAssembly?.name ?? '';
  const chosen =
    picked ?? new Set([position.id, ...alreadyIn.map((numberOnSheet) => numberOnSheet.id)]);

  // Every one of the five answers with the sheet, so every one of them writes it straight into
  // the cache — the panel beside the drawing is reading the same query and must not go on saying
  // what was true before this press.
  const putIn = useMutation({
    mutationFn: () =>
      api.putInSubAssembly(tavolaId, { name: name.trim(), positionIds: [...chosen] }),
    onSuccess: (written) => {
      record(written);
      setTypedName(null);
      setPicked(null);
    },
  });
  const takeOut = useMutation({
    mutationFn: () => api.takeOutOfSubAssembly(position.id),
    onSuccess: (written) => {
      record(written);
      setTypedName(null);
      setPicked(null);
    },
  });
  const dissolve = useMutation({
    mutationFn: (subAssemblyId: string) => api.dissolveSubAssembly(subAssemblyId),
    onSuccess: (written) => {
      record(written);
      setTypedName(null);
      setPicked(null);
    },
  });
  const relate = useMutation({
    mutationFn: (otherPositionId: string) =>
      api.relatePositions(tavolaId, { positionId: position.id, otherPositionId }),
    onSuccess: record,
  });
  const unrelate = useMutation({
    mutationFn: (linkId: string) => api.unrelatePositions(linkId),
    onSuccess: record,
  });

  const writes = [putIn, takeOut, dissolve, relate, unrelate];
  const busy = writes.some((mutation) => mutation.isPending);
  const refusal = writes.find((mutation) => mutation.error)?.error?.message ?? null;

  return (
    <section aria-labelledby="belongs-with" className="editor-panel registration-mark animate-rise">
      <h2 id="belongs-with" className="label">
        What goes with <span className="tabular">{position.number}</span>
      </h2>

      <div className="mt-8 grid gap-10 sm:grid-cols-2">
        <section className="flex flex-col gap-4">
          <div>
            <h3 className="label">Sub-assembly</h3>
            <p className="mt-2 max-w-measure text-sm text-pretty text-faint">
              Everything that comes apart at once. A number belongs to one of these or to none, and
              naming it into another moves it.
            </p>
          </div>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              putIn.mutate();
            }}
          >
            <Field
              label="Sub-assembly name"
              data-testid="sub-assembly-name"
              // Typed with what the sheet already uses offered, never chosen from it: adding to
              // *Door Lock* is one keystroke, and the first *Window Slider* is still recordable.
              suggestions={sheet.subAssemblies.map((one) => one.name)}
              hint="What these numbers are together — Window Slider, Door Lock. A sheet has one of each name."
              value={name}
              onChange={(event) => setTypedName(event.target.value)}
            />

            {/*
             * **The numbers, picked rather than visited one at a time.** The sheet's own order,
             * with whatever is already in this Sub-assembly — and the number being read — already
             * chosen, so the common case is type a name and press once.
             */}
            <fieldset className="flex flex-col gap-2">
              <legend className="label">Numbers in it</legend>
              <ul className="mt-2 flex flex-wrap gap-2" data-testid="sub-assembly-picker">
                {sheet.positions.map((candidate) => (
                  <li key={candidate.id}>
                    <PositionChip
                      position={candidate}
                      selected={chosen.has(candidate.id)}
                      onSelect={() => setPicked(toggled(chosen, candidate.id))}
                      testId="pick-position"
                    />
                  </li>
                ))}
              </ul>
            </fieldset>

            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                variant="outline"
                disabled={busy || name.trim() === '' || chosen.size === 0}
              >
                Record this sub-assembly
              </Button>

              {subAssembly && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => takeOut.mutate()}
                  >
                    Take <span className="tabular">{position.number}</span> out
                  </Button>
                  {/* The numbers stay on the sheet; it is the name that goes. */}
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => dissolve.mutate(subAssembly.id)}
                  >
                    Dissolve {subAssembly.name}
                  </Button>
                </>
              )}
            </div>
          </form>
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <h3 className="label">Works with</h3>
            <p className="mt-2 max-w-measure text-sm text-pretty text-faint">
              The narrow one — the single number this part works against. Recorded once here and
              shown on both, so nobody enters it twice.
            </p>
          </div>

          {related.length > 0 && (
            <ul className="flex flex-col border-t border-line" data-testid="editor-related">
              {related.map((link) => (
                <li
                  key={link.linkId}
                  className="flex items-center justify-between gap-4 border-b border-line py-2"
                >
                  <span className="tabular">{link.position.number}</span>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => unrelate.mutate(link.linkId)}
                  >
                    Unlink
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {linkable.length === 0 ? (
            <p className="max-w-measure text-sm text-pretty text-faint">
              There is no other number on this sheet left to link this one to.
            </p>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                relate.mutate(other, { onSuccess: () => setOther('') });
              }}
            >
              <Select
                label="Link to"
                data-testid="relate-to"
                // Its options are numbers the factory printed, and a number in this archive is
                // always set in the mono face — a list to be compared, not read.
                mono
                value={other}
                onChange={(event) => setOther(event.target.value)}
              >
                <option value="">Choose a number on this sheet</option>
                {linkable.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.number}
                  </option>
                ))}
              </Select>
              <div>
                <Button type="submit" variant="outline" disabled={busy || other === ''}>
                  Link <span className="tabular">{position.number}</span> to it
                </Button>
              </div>
            </form>
          )}
        </section>
      </div>

      {refusal && <Refusal>{refusal}</Refusal>}
    </section>
  );
}
