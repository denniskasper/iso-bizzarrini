import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Refusal, TextArea } from '@/components/ui/field';
import { api, type PastedColumns, type PastedRow, type PastePlanResponse } from '@/lib/api';
import { useRereadMovedListing } from '@/lib/parts';

/**
 * **A whole catalog page at once, and a way back out into a spreadsheet** (stories 113–114).
 *
 * An evening's transcription is two hundred rows. Two hundred forms is why volunteers stop, so
 * this is the concession that keeps a spreadsheet-native Editor productive — and losing an Editor
 * is worse than any schema decision.
 *
 * **Nothing is written until the Editor has read what will happen.** That is the whole shape of
 * this panel: one dominant action at a time, and the first of them writes nothing at all. A paste
 * lands, the archive says what it made of every column and every row, and only then is there a
 * button that records anything. An Editor who mis-set a column finds out here rather than two
 * hundred rows later.
 *
 * And what it does is deliberately narrow: it creates Parts the archive has never met and matches
 * the ones it has. It never changes a Part that already exists (ADR 0005) — correcting one is a
 * screen where a single Part is in front of a single person.
 */

/**
 * The archive's own name for each field it reads a column as — **written once here**, because
 * three things on this panel need the same list: the placeholder that shows an Editor what a
 * sheet looks like, the hint under the box, and the table saying which of their columns was read
 * as what. Three copies would be three chances to tell an Editor a column name the API does not
 * recognise.
 */
const FIELDS: [keyof PastedColumns, string][] = [
  ['position', 'Position'],
  ['catalogNumber', 'Catalog Number'],
  ['nameEn', 'Name (English)'],
  ['nameIt', 'Name (Italian)'],
  ['quantityPerCar', 'Quantity'],
  ['disegnoOrigine', 'Disegno Origine'],
  ['drawn', 'Drawn'],
];

/** What the box says when it is empty: that header, and one row of a real catalog page under it. */
const EXAMPLE = [
  FIELDS.map(([, label]) => label).join('\t'),
  ['207', '260 03 150', 'Window channel guide rod', 'ASTA GUIDA', '2', '208503', 'yes'].join('\t'),
].join('\n');

export function BulkPaste({ tavolaId }: { tavolaId: string }) {
  const [text, setText] = useState('');
  /**
   * The preview the Editor is looking at, and **the text it was read from**.
   *
   * The two are held together because a plan is only true of the text it was drawn for. Editing
   * the box after a preview would otherwise leave a stale table above a *Record* button, which is
   * the one press this panel exists to make safe: the plan goes the moment the text stops
   * matching it.
   */
  const [shown, setShown] = useState<{ from: string; plan: PastePlanResponse } | null>(null);
  /** And what a paste actually did, which is a different thing on screen and outlives the text. */
  const [recorded, setRecorded] = useState<PastePlanResponse | null>(null);
  const queryClient = useQueryClient();
  /** The sheet's index, and the Parts at every number on it — a paste can have added to any. */
  const reread = useRereadMovedListing(tavolaId);

  const preview = useMutation({
    mutationFn: (pasted: string) => api.previewPaste(tavolaId, { text: pasted }),
    onSuccess: (plan, pasted) => {
      setRecorded(null);
      setShown({ from: pasted, plan });
    },
  });

  const record = useMutation({
    mutationFn: (pasted: string) => api.applyPaste(tavolaId, { text: pasted }),
    onSuccess: async (plan) => {
      setText('');
      setShown(null);
      setRecorded(plan);
      // **Everything above this panel, because a paste can have changed any of it**: the sheet
      // gains numbers, its index gains rows, and the Parts at any number on it may be new. The
      // drawing and its facing page are on the same screen as this, and an index still saying
      // "nothing recorded here" about a number just filled in would be the archive contradicting
      // itself in one glance.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tavola', tavolaId] }),
        reread(),
      ]);
    },
  });

  /** The preview on screen, if it is still a plan about what is in the box. */
  const planned = shown && shown.from === text ? shown.plan : null;
  const willWrite = planned ? planned.tally.newParts + planned.tally.matchedParts : 0;
  const refusal = preview.error ?? record.error;

  return (
    <section aria-labelledby="bulk-paste" className="editor-panel registration-mark animate-rise">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
        <h2 id="bulk-paste" className="label">
          A whole page at once
        </h2>
        {/*
         * A plain link and not a request, because what comes back is a file to be saved rather
         * than an answer to be read. It is the way *out* of this panel and sits opposite the way
         * in — never competing with the one action below, which is why it is not a primary.
         */}
        <a
          href={api.spreadsheetUrl(tavolaId)}
          download
          className={buttonVariants({ variant: 'outline' })}
        >
          Export this drawing
        </a>
      </div>

      <p className="mt-4 max-w-measure text-pretty text-muted">
        Paste the rows for this drawing straight out of a spreadsheet, header row and all. Nothing
        is recorded until you have seen what it will do.
      </p>

      <div className="mt-8">
        <TextArea
          label="The rows"
          mono
          rows={10}
          spellCheck={false}
          value={text}
          placeholder={EXAMPLE}
          hint={`Columns are recognised from the header: ${FIELDS.map(([, label]) => label).join(', ')}. A sheet with only some of them is fine, and a blank cell in a Drawn column means not drawn.`}
          onChange={(event) => {
            setText(event.target.value);
            setRecorded(null);
            preview.reset();
            record.reset();
          }}
        />
      </div>

      {refusal && <Refusal>{refusal.message}</Refusal>}

      {/*
       * **One dominant action at a time, and the first of them writes nothing.** There is no
       * press on this panel that records anything until a plan has been on the screen — which is
       * the ticket's *preview before anything is written*, made structural rather than advisory.
       */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {recorded ? (
          <Button variant="outline" onClick={() => setRecorded(null)}>
            Paste another page
          </Button>
        ) : planned === null ? (
          <Button
            variant="primary"
            disabled={text.trim() === '' || preview.isPending}
            onClick={() => preview.mutate(text)}
          >
            {preview.isPending ? 'Reading…' : 'Show me what this will do'}
          </Button>
        ) : (
          <>
            <Button
              variant="primary"
              disabled={willWrite === 0 || record.isPending}
              onClick={() => record.mutate(text)}
            >
              {record.isPending ? 'Recording…' : `Record ${willWrite} ${rows(willWrite)}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setText('');
                setShown(null);
              }}
            >
              Clear
            </Button>
          </>
        )}
      </div>

      {recorded && (
        <p role="status" className="mt-8 text-pretty" data-testid="paste-recorded">
          {recorded.tally.newParts + recorded.tally.matchedParts}{' '}
          {rows(recorded.tally.newParts + recorded.tally.matchedParts)} recorded on this drawing.
        </p>
      )}

      {(recorded ?? planned) && <Plan plan={(recorded ?? planned) as PastePlanResponse} />}
    </section>
  );
}

/** What the paste will do, or what it did — the same table, because it is the same reading. */
function Plan({ plan }: { plan: PastePlanResponse }) {
  return (
    <div className="mt-10">
      <Counts plan={plan} />
      <Columns columns={plan.columns} />

      {/*
       * Capped and scrolled rather than run down the page. A catalog page is two hundred rows,
       * and a panel two hundred rows tall pushes the drawing this is about off the screen —
       * every one of them is here, in the order they were pasted, in a box of its own.
       */}
      <div className="mt-8 max-h-long-list overflow-y-auto border-t border-line">
        <table className="w-full text-left">
          <caption className="sr-only">Every pasted row, and what becomes of it</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Line</th>
              <th scope="col">Position</th>
              <th scope="col">Part</th>
              <th scope="col">What happens</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((row) => (
              <Row key={row.line} row={row} applied={plan.applied} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The four counts, before the rows.
 *
 * **Counts and not a score.** Refused rows sit beside the rest rather than above them as an
 * alarm: a page of two hundred with one unreadable quantity in it is an ordinary page, and the
 * row itself says which one and why.
 */
function Counts({ plan }: { plan: PastePlanResponse }) {
  const { tally, applied } = plan;
  const counts: [number, string][] = [
    [tally.newParts, applied ? 'parts recorded' : 'new parts'],
    [tally.matchedParts, applied ? 'parts already in the archive' : 'matched to a part'],
    [tally.alreadyListed, 'already listed here'],
    [tally.newPositions, applied ? 'numbers added' : 'numbers to add'],
    [tally.refused, 'rows not read'],
  ];

  return (
    <dl className="flex flex-wrap gap-x-10 gap-y-4">
      {counts.map(([count, label]) => (
        <div key={label}>
          <dd className={`tabular text-2xl ${count === 0 ? 'text-faint' : ''}`}>{count}</dd>
          <dt className="label mt-1">{label}</dt>
        </div>
      ))}
    </dl>
  );
}

/**
 * Which of the Editor's own columns was read as what — **the check that has to come before the
 * rows.** A column read as the wrong field produces two hundred rows that all look plausible,
 * and this is the only place that mistake is visible in one glance.
 */
function Columns({ columns }: { columns: PastedColumns }) {
  return (
    <div className="mt-8">
      <h3 className="label">Read from your columns</h3>
      <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
        {FIELDS.map(([field, label]) => (
          <div
            key={field}
            className="flex items-baseline justify-between gap-6 border-b border-line py-2"
          >
            <dt className="text-sm text-muted">{label}</dt>
            {/*
             * The Editor's own header, quoted back. Not in the mono face: it is a column name
             * they wrote, and that face is for the factory's numbers.
             */}
            <dd className={columns[field] === null ? 'text-sm text-faint' : 'text-sm'}>
              {columns[field] ?? 'not in your sheet'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * One row, and what becomes of it.
 *
 * The four outcomes are named in words rather than coloured, because the difference between
 * *recorded* and *matched* is not a severity and colour would make it look like one.
 *
 * **What the row says and what the archive already holds are both shown, side by side** — that is
 * the whole of *what will be created and what will be matched to an existing Part*. A row that
 * merely said "Matched" would be asking an Editor to take the archive's word for which component
 * it had picked, on the one screen where that judgement is theirs to make. The quantity and the
 * drawn flag are here for the same reason: they are what is about to be written, and *drawn*
 * decides whether a member reads the part as an alternative or as something also needed.
 */
function Row({ row, applied }: { row: PastedRow; applied: boolean }) {
  const said: Record<PastedRow['outcome'], string> = {
    'new-part': applied ? 'Recorded' : 'New part',
    'matched-part': applied ? 'Listed here' : 'Matched',
    'already-listed': 'Already listed',
    refused: applied ? 'Not read — nothing recorded' : 'Not read',
  };

  const name = row.part?.nameEn ?? row.part?.nameIt;
  const matched = row.matched;

  return (
    <tr className="border-b border-line align-baseline">
      <td className="tabular py-3 pr-4 text-xs text-faint">{row.line}</td>
      <td className="tabular py-3 pr-4 text-sm whitespace-nowrap">
        {row.positionNumber ?? <span className="text-faint">—</span>}
        {row.newPosition && <span className="tag ml-2">new</span>}
      </td>
      <td className="py-3 pr-4 text-sm text-pretty">
        {name ?? <span className="text-faint">—</span>}
        {row.part?.catalogNumber && (
          <span className="tabular ml-3 text-xs text-muted">{row.part.catalogNumber}</span>
        )}
        {row.part && (
          <span className="tag ml-3">
            {row.part.drawn ? 'Drawn' : 'Not drawn'}
            {row.part.quantityPerCar !== null && (
              <span className="tabular"> · ×{row.part.quantityPerCar}</span>
            )}
          </span>
        )}

        {/* The Part the archive already holds — named, so the Editor can see it is the one they
            meant rather than being told a match happened. */}
        {matched && (
          <span className="block text-xs text-muted">
            {applied ? 'listed' : 'to be listed'} against{' '}
            <span className="text-text">{matched.nameEn ?? matched.nameIt}</span>
            {matched.catalogNumber && <span className="tabular ml-2">{matched.catalogNumber}</span>}
          </span>
        )}
        {row.matchedLine !== undefined && (
          <span className="block text-xs text-muted">
            the same part line <span className="tabular">{row.matchedLine}</span> records
          </span>
        )}

        {row.why && <span className="block text-xs text-pretty text-alarm">{row.why}</span>}
      </td>
      <td className="label py-3 text-right">{said[row.outcome]}</td>
    </tr>
  );
}

function rows(count: number): string {
  return count === 1 ? 'row' : 'rows';
}
