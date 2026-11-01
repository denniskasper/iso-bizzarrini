import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { CopyLink } from '@/components/copy-link';
import { PhotographListEditor } from '@/components/editor/photograph-editor';
import { EnglishName } from '@/components/machine-translation';
import { PartPhotographs } from '@/components/parts/part-photographs';
import { Button } from '@/components/ui/button';
import { Refusal, TextArea } from '@/components/ui/field';
import {
  api,
  refusalText,
  type ListedPart,
  type SubAssemblyInFull,
  type SubAssemblyPosition,
} from '@/lib/api';
import { subAssemblyKey } from '@/lib/positions';
import { useSession } from '@/lib/session';

/**
 * **A Sub-assembly read as one thing** (issue #110) — the window slider or the door lock, which is
 * what restorers photograph and talk about rather than its single screws.
 *
 * The page is the name, its Photographs, the club's Note about the assembly as a whole, and its
 * numbers with what sits at each — every one of them a way back to that number on the drawing.
 * The address is the Tavola and the Sub-assembly, so it can be sent to somebody and opens through
 * the sign-in screen like a Position's does.
 */
export function SubAssemblyPage() {
  const { tavolaId, subAssemblyId } = useParams({
    from: '/tavole/$tavolaId/sub-assemblies/$subAssemblyId',
  });

  const page = useQuery({
    queryKey: subAssemblyKey(tavolaId, subAssemblyId),
    queryFn: () => api.subAssembly(tavolaId, subAssemblyId),
  });
  // The sheet it is on, for the line that says where this is. Usually in the cache already, from
  // the drawing the member came from.
  const sheet = useQuery({ queryKey: ['tavola', tavolaId], queryFn: () => api.tavola(tavolaId) });

  if (page.isPending) {
    return <p className="text-lg text-muted">Reading the sub-assembly…</p>;
  }

  if (page.isError) {
    return (
      <div className="animate-rise">
        <h1 className="text-3xl">That sub-assembly is not in the archive.</h1>
        <p className="mt-6 max-w-measure text-pretty text-muted">{page.error.message}</p>
        <Link
          to="/tavole/$tavolaId"
          params={{ tavolaId }}
          className="mt-8 inline-block text-accent-ink underline underline-offset-4"
        >
          Back to the drawing
        </Link>
      </div>
    );
  }

  const { subAssembly, positions } = page.data;
  const tavola = sheet.data?.tavola;

  return (
    <div className="animate-rise" data-testid="sub-assembly-page">
      {/* Where it sits, on one line: the car, then the drawing it is part of. */}
      <p className="flex flex-wrap items-baseline gap-x-4 text-lg text-muted">
        {tavola && (
          <>
            <Link
              to="/models/$modelId"
              params={{ modelId: tavola.model.id }}
              className="-my-2 flex min-h-control items-center hover:text-text"
            >
              {tavola.model.brand} {tavola.model.name}
            </Link>
            <span aria-hidden className="text-line-strong">
              /
            </span>
          </>
        )}
        <Link
          to="/tavole/$tavolaId"
          params={{ tavolaId }}
          className="-my-2 flex min-h-control items-center hover:text-text"
          data-testid="sub-assembly-tavola"
        >
          {tavola ? (
            <span>
              Tavola <span className="tabular text-text">{tavola.number}</span> {tavola.nameEn}
            </span>
          ) : (
            'The drawing'
          )}
        </Link>
      </p>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h1 className="text-3xl text-balance sm:text-4xl">{subAssembly.name}</h1>
        <CopyLink />
      </div>
      <p className="mt-1 max-w-measure text-pretty text-muted">
        A sub-assembly: the numbers on this drawing that come apart together. Not a kit, and not
        ordered as one.
      </p>

      <ItsPhotographs tavolaId={tavolaId} subAssembly={subAssembly} />

      <div className="mt-12 grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ItsNumbers tavolaId={tavolaId} positions={positions} />
        <ItsNote tavolaId={tavolaId} subAssembly={subAssembly} />
      </div>
    </div>
  );
}

/**
 * **The assembly as restorers photograph it** (issue #114), the first one large: an Editor chose
 * it as the picture that says which assembly this is. Above the numbers, because it is how a
 * member recognises the thing before reading what it is made of. A Member is shown nothing where
 * there are none; an Editor is shown the list to add them to, order and remove.
 */
function ItsPhotographs({
  tavolaId,
  subAssembly,
}: {
  tavolaId: string;
  subAssembly: SubAssemblyInFull;
}) {
  const { isEditor } = useSession();
  const queryClient = useQueryClient();

  if (subAssembly.photographs.length === 0 && !isEditor) {
    return null;
  }

  return (
    <section aria-label="Photographs" className="mt-6" data-testid="sub-assembly-photographs">
      <PartPhotographs
        photographs={subAssembly.photographs}
        partName={subAssembly.name}
        setting="page"
      />
      {isEditor && (
        <div className="max-w-2xl">
          <PhotographListEditor
            photographs={subAssembly.photographs}
            about="The assembly as it looks put together. The first one is what a member sees first."
            add={(file) => api.addSubAssemblyPhotograph(subAssembly.id, file)}
            reorder={(photographIds) =>
              api.reorderSubAssemblyPhotographs(subAssembly.id, { photographIds })
            }
            remove={(photographId) => api.removeSubAssemblyPhotograph(subAssembly.id, photographId)}
            onChanged={() =>
              void queryClient.invalidateQueries({
                queryKey: subAssemblyKey(tavolaId, subAssembly.id),
              })
            }
          />
        </div>
      )}
    </section>
  );
}

/**
 * Its numbers, as the sheet's own index prints them: the number, then what sits at it. Each row
 * is the way to that number on the drawing, with the Part beside it already open.
 */
function ItsNumbers({
  tavolaId,
  positions,
}: {
  tavolaId: string;
  positions: SubAssemblyPosition[];
}) {
  return (
    <section aria-labelledby="its-numbers">
      <h2 id="its-numbers" className="label">
        Its numbers
      </h2>
      <p className="mt-2 max-w-measure text-sm text-pretty text-muted">
        Select one to see it on the drawing.
      </p>

      <ul className="mt-6 border-b border-line" data-testid="sub-assembly-numbers">
        {positions.map((position) => (
          <li key={position.id}>
            <Link
              to="/tavole/$tavolaId"
              params={{ tavolaId }}
              search={{ position: position.number }}
              data-testid="sub-assembly-number"
              data-position={position.number}
              className="sheet-line listed"
            >
              <span className="tabular text-lg text-text">{position.number}</span>
              {position.parts.length === 0 ? (
                <span className="text-sm text-pretty text-faint">Not recorded yet</span>
              ) : (
                <span className="flex flex-col gap-2">
                  {position.parts.map((part) => (
                    <PartLine key={part.id} part={part} />
                  ))}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A Part as the index names it: what it is called, and the number it is ordered by. */
function PartLine({ part }: { part: ListedPart }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-pretty">
        {part.nameEn === null ? (
          part.nameIt
        ) : (
          <EnglishName
            nameEn={part.nameEn}
            nameIt={part.nameIt}
            machineTranslated={part.nameEnMachineTranslated}
          />
        )}
      </span>
      {part.catalogNumber !== null && (
        <span className="tabular text-sm text-muted">{part.catalogNumber}</span>
      )}
    </span>
  );
}

/**
 * **What the club knows about the assembly as a whole**, written once here rather than on each of
 * its screws. A Member reads it; an Editor writes, changes and clears it. With none written, a
 * Member is shown nothing rather than an empty heading.
 */
function ItsNote({ tavolaId, subAssembly }: { tavolaId: string; subAssembly: SubAssemblyInFull }) {
  const { isEditor } = useSession();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (note: string) => api.writeSubAssemblyNote(subAssembly.id, { note }),
    onSuccess: (written) => {
      queryClient.setQueryData(subAssemblyKey(tavolaId, subAssembly.id), written);
      setDraft(null);
    },
  });

  if (subAssembly.note === null && !isEditor) {
    return null;
  }

  return (
    <section aria-labelledby="its-note" data-testid="sub-assembly-note">
      <h2 id="its-note" className="label">
        The club’s note
      </h2>

      {draft === null ? (
        <>
          {subAssembly.note === null ? (
            <p className="mt-2 max-w-measure text-sm text-pretty text-faint">
              Nothing written about it yet.
            </p>
          ) : (
            <p
              className="mt-2 max-w-measure text-pretty whitespace-pre-line text-text"
              data-testid="sub-assembly-note-text"
            >
              {subAssembly.note}
            </p>
          )}
          {isEditor && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                save.reset();
                setDraft(subAssembly.note ?? '');
              }}
            >
              {subAssembly.note === null ? 'Write a note' : 'Change the note'}
            </Button>
          )}
        </>
      ) : (
        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(draft);
          }}
        >
          <TextArea
            label={`The note about ${subAssembly.name}`}
            hint="What the club knows about it as a whole. Leave it empty to clear the note."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={5}
            autoFocus
          />
          {save.error && <Refusal>{refusalText(save.error)}</Refusal>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save the note'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
