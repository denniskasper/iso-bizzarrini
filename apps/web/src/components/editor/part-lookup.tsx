import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Refusal } from '@/components/ui/field';
import { api, type FoundPart } from '@/lib/api';

/**
 * Finding a Part the archive already has, in order to list it somewhere else (story 103).
 *
 * **This is what ticket 06 had no way to do.** The single path that listed an existing Part was
 * the Catalog Number collision — so a Part with *no* number could be listed exactly once and
 * never again, and an Editor who removed a Listing by mistake had no way to put it back. The
 * archive had the operation; nothing on any screen could reach it.
 *
 * It is also the only thing in the archive that can see a Part listed **nowhere**. Such a Part is
 * on no drawing, in no index and behind no circle, and it is still holding its Catalog Number —
 * so typing that number is refused and points at something the Editor cannot open. Here it comes
 * back like anything else, saying plainly that nothing lists it.
 *
 * A tool, in the Google half of the direction: one field, one action, and the results set as the
 * printed index everything else in this archive is set as. It is deliberately **not Search** —
 * catalog number and the two names, nothing else. Ticket 22 owns Search, reaches further, and is
 * meant to absorb this rather than stand beside it.
 */
export function PartLookup({
  /** What to call listing the found Part here. Absent where there is nothing to list it at. */
  onList,
  onCorrect,
  busy = false,
  refusal,
}: {
  onList?: ((partId: string) => void) | undefined;
  onCorrect: (partId: string) => void;
  busy?: boolean;
  refusal?: string | null;
}) {
  const [typed, setTyped] = useState('');
  /** What was actually asked for. A keystroke is not a question — pressing the button is. */
  const [asked, setAsked] = useState('');

  const found = useQuery({
    queryKey: ['part-lookup', asked],
    queryFn: () => api.lookUpParts(asked),
    enabled: asked !== '',
  });

  return (
    <div className="mt-8 flex flex-col gap-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setAsked(typed.trim());
        }}
      >
        <Field
          label="Find a part the archive already has"
          data-testid="part-lookup"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onFocus={(event) => event.target.select()}
          autoComplete="off"
          spellCheck={false}
          placeholder="260 03 150"
          hint="A catalog number — the spacing does not matter — or the beginning of either name."
        />
        <div>
          <Button type="submit" variant="outline" disabled={typed.trim() === ''}>
            Find it
          </Button>
        </div>
      </form>

      <div aria-live="polite">
        {found.isError && <Refusal>{found.error.message}</Refusal>}

        {found.isSuccess &&
          (found.data.parts.length === 0 ? (
            <p className="max-w-measure text-sm text-pretty text-faint">
              Nothing in the archive matches that. If this is a part nobody has recorded yet, record
              it below.
            </p>
          ) : (
            <>
              <ul className="border-t border-line">
                {found.data.parts.map((match) => (
                  <Found
                    key={match.part.id}
                    match={match}
                    busy={busy}
                    onList={onList}
                    onCorrect={onCorrect}
                  />
                ))}
              </ul>
              {/* A capped list must never read as a complete one: an Editor told "nothing
                  matches" by an answer that stopped early records a second copy of it. */}
              {found.data.more && (
                <p className="mt-3 max-w-measure text-xs text-pretty text-faint">
                  More matched than are shown. Type more of the name, or the catalog number.
                </p>
              )}
            </>
          ))}

        {refusal && <Refusal>{refusal}</Refusal>}
      </div>
    </div>
  );
}

/**
 * One line of the answer: what the Part is, and **where it already is** — which is what an
 * Editor is actually deciding on. A Part listed on three sheets is probably the one they mean; a
 * Part listed nowhere is the one that needs rescuing.
 */
function Found({
  match,
  busy,
  onList,
  onCorrect,
}: {
  match: FoundPart;
  busy: boolean;
  onList?: ((partId: string) => void) | undefined;
  onCorrect: (partId: string) => void;
}) {
  const { part, listedOn } = match;

  return (
    <li
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line py-3"
      data-testid="found-part"
    >
      <div className="max-w-measure">
        <p className="text-pretty">
          {part.nameEn ?? part.nameIt}
          {part.catalogNumber !== null && (
            <span className="tabular ml-4 text-sm text-muted">{part.catalogNumber}</span>
          )}
        </p>
        <p className="mt-1 text-xs text-faint">{whereItIs(listedOn)}</p>
      </div>

      <span className="flex items-center gap-1">
        {onList && (
          <Button variant="outline" disabled={busy} onClick={() => onList(part.id)}>
            List it here
          </Button>
        )}
        <Button variant="ghost" onClick={() => onCorrect(part.id)}>
          Correct it
        </Button>
      </span>
    </li>
  );
}

/** Where the archive already has it, or the plain statement that it has it nowhere. */
function whereItIs(listedOn: FoundPart['listedOn']): ReactNode {
  if (listedOn.length === 0) {
    return <strong className="font-semibold">Listed on no drawing</strong>;
  }

  return (
    <>
      Listed on{' '}
      {listedOn.map((sheet, index) => (
        <span key={sheet.tavolaId}>
          {index > 0 && ', '}
          <span className="tabular">Tavola {sheet.tavolaNumber}</span> ({sheet.model.brand}{' '}
          {sheet.model.name})
        </span>
      ))}
    </>
  );
}
