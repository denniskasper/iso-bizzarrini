import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import { api } from '@/lib/api';

/**
 * Uploading the scan (stories 93 and 94).
 *
 * **The Editor never says what format it is.** They pick a file — a TIFF off a flatbed, a
 * photograph from a phone — and the archive prepares it for viewing. Nothing here inspects the
 * file, and the API does not trust what the browser says it is either: ingest reads the bytes.
 *
 * Re-uploading replaces the drawing and its derived images, and the Tavola is never left
 * without one, so there is no "delete the scan first" step and no state in between.
 */

/**
 * What the file picker offers first. A hint to the operating system and nothing more — it is
 * not a rule, it does not validate, and a `.tif` that arrives with no type at all is still
 * accepted. What a file *is* is decided by reading it, at the API.
 */
const PICKER_HINT = 'image/png,image/jpeg,image/tiff,image/webp,image/avif,image/heif';

export function ScanUpload({ tavolaId, hasScan }: { tavolaId: string; hasScan: boolean }) {
  const [chosen, setChosen] = useState<File | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const pickerId = useId();
  const queryClient = useQueryClient();

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadScan(tavolaId, file),
    onSuccess: async () => {
      setChosen(null);
      if (picker.current) {
        picker.current.value = '';
      }
      await queryClient.invalidateQueries({ queryKey: ['tavola', tavolaId] });
    },
  });

  return (
    <section aria-labelledby="scan-upload">
      <h2 id="scan-upload" className="label">
        {hasScan ? 'Replace the scan' : 'Upload the scan'}
      </h2>
      <p className="mt-4 max-w-measure text-pretty text-muted">
        {hasScan
          ? 'A new scan replaces this one everywhere it is shown. Nothing else about the drawing changes.'
          : 'Pick the scanned sheet. It is prepared for viewing here — you do not need to convert it first.'}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        {/*
          A label rather than a styled `file:` pseudo-element: the browser's own file button
          cannot be given the archive's outline treatment without writing every one of its
          utilities out a second time, and a label opens the picker natively with no script.
        */}
        <label htmlFor={pickerId} className={buttonVariants({ variant: 'outline' })}>
          {chosen ? 'Choose another' : 'Choose a scan'}
        </label>
        <input
          ref={picker}
          id={pickerId}
          type="file"
          accept={PICKER_HINT}
          className="sr-only"
          onChange={(event) => setChosen(event.target.files?.[0] ?? null)}
        />

        <Button
          variant="primary"
          disabled={!chosen || upload.isPending}
          onClick={() => chosen && upload.mutate(chosen)}
        >
          {upload.isPending ? 'Preparing…' : hasScan ? 'Replace' : 'Upload'}
        </Button>
      </div>

      {chosen && (
        <p className="mt-4 text-sm text-muted">
          <span className="tabular">{chosen.name}</span>
        </p>
      )}

      {upload.isError && <Refusal>{upload.error.message}</Refusal>}
    </section>
  );
}
