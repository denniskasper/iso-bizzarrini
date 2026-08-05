import { useId, useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import {
  refusalText,
  type RosterImportColumns,
  type RosterImportPlan,
  type RosterImportRow,
} from '@/lib/api';
import { useImportRoster, usePreviewRosterImport } from '@/lib/roster';

/**
 * **The Club's annual membership list, loaded instead of typed** (story 122).
 *
 * A hundred members typed into a form once a year is why an Administrator stops keeping the roster
 * up to date, and a roster nobody keeps up to date is the whole "I paid, why can't I get in"
 * problem arriving from the other direction.
 *
 * **Nothing is written until the Administrator has read what will happen.** That is the shape of
 * this screen and it is structural rather than advisory: one action at a time, and there is no
 * press here that records anything until a plan has been on the screen.
 *
 * And the thing this screen has to say loudest is what it will **not** do. The ordinary accident
 * with a membership list is a truncated export, a half-finished file, last year's copy — so the
 * count of people the file does not mention is on the screen beside the counts of what changes,
 * and it is the one that gets a sentence of its own.
 */

/**
 * The archive's own name for each column it reads — **written once here**, because two things on
 * this screen need the same list: the note that tells an Administrator what their sheet should
 * look like, and the table saying which of their columns was read as what.
 */
const FIELDS: [keyof RosterImportColumns, string][] = [
  ['name', 'Name'],
  ['email', 'E-mail'],
  ['paidThrough', 'Paid through'],
];

/** What the operating system's picker offers first. A hint and not a rule — the API reads it. */
const PICKER_HINT = '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain';

export function RosterImport() {
  /** The file the Administrator picked, and what was in it. Held together: one is the other's name. */
  const [chosen, setChosen] = useState<{ name: string; text: string } | null>(null);
  /** What the archive said this file would do, and **which file it said it about.** */
  const [shown, setShown] = useState<{ from: string; plan: RosterImportPlan } | null>(null);
  /** And what the import actually did, which outlives the file it was read from. */
  const [loaded, setLoaded] = useState<RosterImportPlan | null>(null);

  const picker = useRef<HTMLInputElement>(null);
  const pickerId = useId();
  const preview = usePreviewRosterImport();
  const load = useImportRoster();

  const startOver = () => {
    setChosen(null);
    setShown(null);
    setLoaded(null);
    preview.reset();
    load.reset();
    if (picker.current) {
      picker.current.value = '';
    }
  };

  // The plan on screen, if it is still a plan about the file that is in hand. Choosing another
  // file must take the old plan with it — a stale table above an *Import* button is the one press
  // this screen exists to make safe.
  const planned = chosen && shown?.from === chosen.text ? shown.plan : null;
  const willWrite = planned ? planned.tally.newMembers + planned.tally.updated : 0;
  const refusal = preview.error ?? load.error;

  return (
    <div className="animate-rise">
      <h1 className="text-4xl font-semibold text-balance">Load the roster from a spreadsheet</h1>
      <p className="mt-6 max-w-measure text-lg text-pretty text-muted">
        Pick the Club's membership list, saved from your spreadsheet as a CSV. Nothing is recorded
        until you have read what it will do — and nothing an import does can take anybody's access
        away.
      </p>

      <section aria-labelledby="the-file" className="editor-panel registration-mark mt-12">
        <h2 id="the-file" className="text-2xs text-muted uppercase">
          The file
        </h2>
        <p className="mt-4 max-w-measure text-pretty text-muted">
          One row per member, with a header row naming {FIELDS.map(([, label]) => label).join(', ')}
          . Whatever your own columns are called, the archive says below what it made of them.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          {/*
            A label rather than the browser's own file button, which cannot be given this
            archive's outline treatment without writing every one of its utilities out again —
            and a label opens the picker natively with no script at all.
          */}
          {/* Gone once a file has been loaded, so that "Load another file" below is the one way
              to start again rather than one of two that do nearly the same thing. */}
          {loaded === null && (
            <>
              <label htmlFor={pickerId} className={buttonVariants({ variant: 'outline' })}>
                {chosen ? 'Choose another file' : 'Choose a file'}
              </label>
              <input
                ref={picker}
                id={pickerId}
                type="file"
                accept={PICKER_HINT}
                className="sr-only"
                onChange={async (event) => {
                  const file = event.target.files?.[0] ?? null;
                  setShown(null);
                  preview.reset();
                  load.reset();
                  setChosen(file === null ? null : { name: file.name, text: await file.text() });
                }}
              />
            </>
          )}

          {/*
            **One action at a time, and the first of them writes nothing.** Reading the file is
            the only thing on offer until a plan is on the screen; importing is the only thing on
            offer once one is.
          */}
          {loaded === null &&
            (planned === null ? (
              <Button
                variant="primary"
                disabled={chosen === null || preview.isPending}
                onClick={() =>
                  chosen &&
                  preview.mutate(chosen.text, {
                    // Kept with the text it was read from, because a plan is only true of the
                    // file it was drawn for.
                    onSuccess: (plan) => setShown({ from: chosen.text, plan }),
                  })
                }
              >
                {preview.isPending ? 'Reading…' : 'Show me what this will do'}
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={willWrite === 0 || load.isPending}
                onClick={() =>
                  chosen &&
                  load.mutate(chosen.text, {
                    onSuccess: (plan) => {
                      // The picker unmounts with `loaded` set, so it needs no clearing here —
                      // `startOver` is what brings a fresh one back.
                      setChosen(null);
                      setShown(null);
                      setLoaded(plan);
                    },
                  })
                }
              >
                {load.isPending ? 'Loading…' : `Import ${willWrite} ${people(willWrite)}`}
              </Button>
            ))}

          {loaded !== null && (
            <Button variant="outline" onClick={startOver}>
              Load another file
            </Button>
          )}
        </div>

        {chosen && (
          <p className="mt-4 text-sm text-muted">
            {/* The file's own name, in the mono face — it is an identifier the Administrator is
                checking against what is in their downloads folder. */}
            <span className="tabular">{chosen.name}</span>
          </p>
        )}

        {refusal && (
          <div className="mt-4">
            <Refusal>{refusalText(refusal)}</Refusal>
          </div>
        )}
      </section>

      {loaded && (
        <p role="status" className="mt-10 text-lg text-pretty" data-testid="roster-imported">
          {loaded.tally.newMembers + loaded.tally.updated}{' '}
          {people(loaded.tally.newMembers + loaded.tally.updated)} recorded.{' '}
          {loaded.tally.newMembers > 0 &&
            `The ${loaded.tally.newMembers} new ${people(loaded.tally.newMembers)} still need inviting, from the roster.`}
        </p>
      )}

      {(loaded ?? planned) && <Plan plan={(loaded ?? planned) as RosterImportPlan} />}
    </div>
  );
}

/** What the file will do, or what it did — the same table, because it is the same reading. */
function Plan({ plan }: { plan: RosterImportPlan }) {
  return (
    <div className="mt-10">
      <Counts plan={plan} />
      <Columns columns={plan.columns} />

      {/*
        Capped and scrolled rather than run down the page. A club roster is a few hundred rows,
        and the counts above are what an Administrator decides on — every row is here, in the
        order the file wrote them, for the one they go looking for.
      */}
      <div className="mt-8 max-h-long-list overflow-y-auto border-b border-line">
        <h3 className="sr-only">Every row of the file, and what becomes of it</h3>
        <ul>
          {plan.rows.map((row) => (
            <Row key={row.line} row={row} applied={plan.applied} />
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * The counts, and then the sentence that is the whole safety argument.
 *
 * **Untouched is the number that matters most and reads as the least**, so it is not left as a
 * counter among four others. An Administrator who has just uploaded half a file needs to know that
 * the other half of the Club is exactly where it was, and a bare figure does not say that.
 */
function Counts({ plan }: { plan: RosterImportPlan }) {
  const { tally, applied } = plan;
  const counts: [number, string][] = [
    [tally.newMembers, applied ? 'added' : 'to add'],
    [tally.updated, applied ? 'updated' : 'to update'],
    [tally.unchanged, 'already as the file says'],
    [tally.refused, 'rows not read'],
  ];

  return (
    <div>
      <dl className="flex flex-wrap gap-x-10 gap-y-4">
        {counts.map(([count, label]) => (
          <div key={label}>
            <dd className={`tabular text-2xl ${count === 0 ? 'text-faint' : ''}`}>{count}</dd>
            <dt className="mt-1 text-2xs text-muted uppercase">{label}</dt>
          </div>
        ))}
      </dl>

      {tally.untouched > 0 && (
        <p className="mt-6 max-w-measure text-pretty text-muted">
          <span className="tabular">{tally.untouched}</span> {people(tally.untouched)} on the roster{' '}
          {tally.untouched === 1 ? 'is' : 'are'} not in this file, and{' '}
          {tally.untouched === 1 ? 'is' : 'are'} left exactly as they are. An import never removes
          anybody, and never shortens a Membership.
        </p>
      )}
    </div>
  );
}

/**
 * Which of the Administrator's own columns was read as what — **the check that comes before the
 * rows.** A column read as the wrong field produces a hundred rows that all look plausible, and
 * this is the only place that mistake is visible in one glance.
 */
function Columns({ columns }: { columns: RosterImportColumns }) {
  return (
    <div className="mt-8">
      <h3 className="text-2xs text-muted uppercase">Read from your columns</h3>
      <dl className="mt-4 grid gap-x-8 sm:grid-cols-3">
        {FIELDS.map(([field, label]) => (
          <div
            key={field}
            className="flex items-baseline justify-between gap-6 border-b border-line py-2"
          >
            <dt className="text-sm text-muted">{label}</dt>
            {/* The Administrator's own header, quoted back. Not in the mono face: it is a column
                name they wrote, and that face is for numbers and identifiers. */}
            <dd className="text-sm">{columns[field]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * One row of the file, and what becomes of it.
 *
 * **What the file says and what the roster holds are both here**, side by side, which is the whole
 * of *exactly what will be created and what will be changed*. A row that only said "Updated" would
 * be asking an Administrator to take the archive's word for what a Membership was about to become,
 * on the one screen where that judgement is theirs to make.
 */
function Row({ row, applied }: { row: RosterImportRow; applied: boolean }) {
  const said: Record<RosterImportRow['outcome'], string> = {
    'new-member': applied ? 'Added' : 'New',
    updated: applied ? 'Updated' : 'To update',
    unchanged: 'Unchanged',
    refused: applied ? 'Not read — nothing recorded' : 'Not read',
  };

  return (
    <li className="import-row" data-outcome={row.outcome}>
      <span className="tabular text-xs text-faint">{row.line}</span>

      <span className="min-w-0">
        <span className="block truncate text-text">
          {row.name ?? row.onTheRoster?.name ?? <span className="text-faint">—</span>}
        </span>
        <span className="tabular block truncate text-sm text-muted">
          {row.email ?? <span className="text-faint">—</span>}
        </span>
        {/*
          **The accent only where something is wrong.** `why` is on every outcome here — an
          unchanged row explains itself too — and painting all of them teal would spend the
          archive's one accent on rows where nothing has happened. It is reserved for the row an
          Administrator has to go and do something about, which is the one that could not be read.
        */}
        {row.why && (
          <span
            className={`mt-1 block text-xs text-pretty ${
              row.outcome === 'refused' ? 'text-accent-ink' : 'text-faint'
            }`}
          >
            {row.why}
          </span>
        )}
      </span>

      {/* The two dates in one column, one under the other, because the only useful thing about
          either is the comparison. A date is an identifier, so both are in the mono face. */}
      <span>
        <span className="tabular block text-sm text-text">
          {row.paidThrough ?? <span className="text-faint">—</span>}
        </span>
        {row.onTheRoster && (
          <span className="tabular block text-xs text-faint">
            roster has {row.onTheRoster.paidThrough ?? 'no term'}
          </span>
        )}
      </span>

      <span className="text-2xs text-muted uppercase md:text-right">{said[row.outcome]}</span>
    </li>
  );
}

function people(count: number): string {
  return count === 1 ? 'member' : 'members';
}
