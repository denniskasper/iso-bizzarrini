import { useMutation } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import { api, type PartInFull, type Photograph } from '@/lib/api';
import { useRereadPart } from '@/lib/parts';

/**
 * Uploading photographs to a Part, ordering them, and taking one off (story 111).
 *
 * **The Editor never says what format anything is**, exactly as they never do for a scan: they
 * pick files off a phone and the archive prepares them. Nothing here inspects a file, and the API
 * does not trust what the browser says it is either — ingest reads the bytes.
 *
 * **The order is the work.** A Part with four photographs of it is not four equal pictures: one
 * of them shows what the component is at a glance and the rest are the casting number, the end
 * that always corrodes, the profile that tells the early one from the late. Which is which is a
 * judgement only somebody who has looked at all four can make, so the first is set large on the
 * panel a member reads and this is where an Editor decides which that is.
 *
 * Arrows and not dragging. The hands using this are cold, gloved or covered in grease, and a
 * drag target is the one gesture that has no keyboard, no screen reader and no forgiveness.
 */
export function PhotographEditor({ part }: { part: PartInFull }) {
  const picker = useRef<HTMLInputElement>(null);
  const pickerId = useId();
  const [chosen, setChosen] = useState<File[]>([]);
  const reread = useRereadPart();

  /**
   * **One at a time, in the order they were picked**, and that is not timidity about parallelism:
   * a photograph goes to the end of the Part's order, so sending six at once would land them in
   * whichever order the requests happened to finish — which is an order nobody chose, on the very
   * list this panel exists to let somebody choose.
   */
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        await api.addPhotograph(part.id, file);
      }
    },
    onSuccess: () => {
      setChosen([]);
      if (picker.current) {
        picker.current.value = '';
      }
    },
    /**
     * **Settled, not succeeded**, because these go up one at a time: the fourth of six failing
     * leaves three that are really there, and re-reading only on success would show the Editor a
     * refusal beside a list missing the photographs they had just uploaded. The refusal is what
     * tells them to try the rest again; the list has to be what the archive actually holds.
     */
    onSettled: () => reread(),
  });

  const reorder = useMutation({
    mutationFn: (photographIds: string[]) => api.reorderPhotographs(part.id, { photographIds }),
    onSuccess: () => reread(),
  });

  const remove = useMutation({
    mutationFn: (photographId: string) => api.removePhotograph(photographId),
    onSuccess: () => reread(),
  });

  const busy = upload.isPending || reorder.isPending || remove.isPending;

  const move = (from: number, to: number) => {
    const order = part.photographs.map((photograph) => photograph.id);
    const [moved] = order.splice(from, 1);
    if (moved === undefined) {
      return;
    }
    order.splice(to, 0, moved);
    reorder.mutate(order);
  };

  return (
    <section
      className="mt-6 flex flex-col gap-6 border-t border-line pt-6"
      data-testid="photograph-editor"
    >
      <div>
        <h3 className="label">Photographs</h3>
        <p className="mt-2 max-w-measure text-sm text-pretty text-faint">
          What the part looks like, which is the one thing a catalog number cannot tell anybody.
          They belong to the part itself, so they show on every sheet it is listed on — and the
          first one is what a member sees without scrolling.
        </p>
      </div>

      {part.photographs.length > 0 && (
        // A list read top to bottom, because that is what an order is. Laid out as a wrapping
        // grid of pictures it would look like a gallery, and a gallery has no first.
        <ul className="flex flex-col border-t border-line" data-testid="editable-photographs">
          {part.photographs.map((photograph, index) => (
            <Editable
              key={photograph.id}
              photograph={photograph}
              at={index}
              total={part.photographs.length}
              busy={busy}
              onEarlier={() => move(index, index - 1)}
              onLater={() => move(index, index + 1)}
              onRemove={() => remove.mutate(photograph.id)}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {/*
          A label rather than a styled `file:` pseudo-element: the browser's own file button
          cannot be given the archive's outline treatment without writing every one of its
          utilities out a second time, and a label opens the picker natively with no script.
        */}
        <label htmlFor={pickerId} className={buttonVariants({ variant: 'outline' })}>
          {chosen.length > 0 ? 'Choose others' : 'Choose photographs'}
        </label>
        <input
          ref={picker}
          id={pickerId}
          type="file"
          // A hint to the operating system and nothing more. It is not a rule, it does not
          // validate, and what a file *is* is decided by reading it, at the API.
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(event) => setChosen([...(event.target.files ?? [])])}
        />

        <Button
          variant="primary"
          disabled={chosen.length === 0 || busy}
          onClick={() => chosen.length > 0 && upload.mutate(chosen)}
        >
          {upload.isPending
            ? 'Preparing…'
            : chosen.length > 1
              ? `Upload ${chosen.length}`
              : 'Upload'}
        </Button>
      </div>

      {chosen.length > 0 && (
        <p className="text-sm text-muted">
          {chosen.map((file) => (
            <span key={file.name} className="tabular mr-4 inline-block">
              {file.name}
            </span>
          ))}
        </p>
      )}

      {upload.isError && <Refusal>{upload.error.message}</Refusal>}
      {reorder.isError && <Refusal>{reorder.error.message}</Refusal>}
      {remove.isError && <Refusal>{remove.error.message}</Refusal>}
    </section>
  );
}

/**
 * One photograph with the three things that can be done to it.
 *
 * The controls sit beside the picture rather than over it, because a control laid on a photograph
 * is a control covering the part of it somebody is trying to see. And the lead **says** it is the
 * lead: an order whose consequence is invisible is an order nobody has a reason to get right.
 */
function Editable({
  photograph,
  at,
  total,
  busy,
  onEarlier,
  onLater,
  onRemove,
}: {
  photograph: Photograph;
  at: number;
  total: number;
  busy: boolean;
  onEarlier: () => void;
  onLater: () => void;
  onRemove: () => void;
}) {
  const place = `${at + 1} of ${total}`;

  return (
    <li
      className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line py-3"
      data-testid="editable-photograph"
    >
      <div className="photograph size-20 shrink-0">
        <img src={photograph.previewUrl} alt={`Photograph ${place}`} decoding="async" />
      </div>

      <p className="tag">{at === 0 ? 'Shown first' : <span className="tabular">{place}</span>}</p>

      <span className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          // Named for what it does to the *order*, because up is where it happens to be sitting
          // on this screen and the order is what a member will read.
          aria-label={`Move photograph ${place} earlier`}
          disabled={busy || at === 0}
          onClick={onEarlier}
        >
          <ChevronUp />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Move photograph ${place} later`}
          disabled={busy || at === total - 1}
          onClick={onLater}
        >
          <ChevronDown />
        </Button>
        <Button
          variant="ghost"
          aria-label={`Remove photograph ${place}`}
          disabled={busy}
          onClick={onRemove}
        >
          Remove
        </Button>
      </span>
    </li>
  );
}
