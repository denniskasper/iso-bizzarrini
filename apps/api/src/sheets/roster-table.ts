import type { RosterImportColumns } from '@ricambi/contracts';
import { dateOrderProvenBy, readCalendarDay, type ProvenDateOrder, type Reading } from './cells.js';
import { columnsMatching, type Sheet, type SheetRow } from './csv.js';

/**
 * **The Club's membership list as a table of text** (ticket 16) — three columns, and what the
 * archive is willing to make of each of them.
 *
 * It reads in one direction only, and that is the difference between this and the catalog's own
 * table. A Tavola is exported so an Editor can work on it in the spreadsheet they are comfortable
 * in and paste it back; the roster is never written out, because the Club's list is kept
 * elsewhere by somebody else and this archive is not the place a membership list is edited in
 * bulk. What comes in is a copy of a list, not a round trip.
 *
 * **The columns are recognised rather than declared**, like the catalog's: an Administrator with
 * an annual spreadsheet will not fill in a form about their own file first. What the archive made
 * of the header comes back with the preview, so the mistake that matters — a column read as the
 * wrong field — is visible before anything is written.
 */

export type RosterField = keyof RosterImportColumns;

/**
 * What each field may be called on a list somebody else keeps.
 *
 * **German and Italian sit here beside English**, and that is not a change of language. Ricambi is
 * English and every word it puts on a screen stays English; this is the archive reading a file it
 * did not write, and the Club's own membership list is kept in the club's own language.
 *
 * Compared with punctuation, accents and case taken out, so `E-Mail`, `e_mail` and `EMAIL` are
 * one name.
 *
 * **`expiry`, `expires` and `valid until` are words `CONTEXT.md` tells this archive to avoid**, and
 * they are here deliberately. The rule is about the language Ricambi *speaks* — a Paid-through is
 * never called an expiry on a screen, in a message or in a type. This is the archive **listening**,
 * and a club secretary's column is headed whatever it is headed. The catalog's own table makes the
 * same exception for the same reason: `part number` is an avoided word and one of its aliases.
 */
const ALIASES: Record<RosterField, readonly string[]> = {
  name: [
    'name',
    'full name',
    'member',
    'member name',
    'nome',
    'nominativo',
    'socio',
    'mitglied',
    'mitgliedsname',
  ],
  email: [
    'e mail',
    'email',
    'e mail address',
    'email address',
    'e mail adresse',
    'mail',
    'posta elettronica',
  ],
  paidThrough: [
    'paid through',
    'paid to',
    'paid until',
    'paid up to',
    'valid until',
    'valid to',
    'expires',
    'expiry',
    'membership expires',
    'scadenza',
    'valido fino al',
    'bezahlt bis',
    'gultig bis',
    'mitglied bis',
  ],
};

/** Which of the file's own columns each field was read from. `null` is one the file has not got. */
export function rosterColumnsOf(sheet: Sheet): RosterImportColumns {
  return columnsMatching<RosterField>(sheet, ALIASES);
}

/**
 * The name the archive would look for, so a file it cannot read is refused in the words that say
 * how to fix it rather than in the words *"unrecognised"*.
 */
export const ROSTER_HEADER: Record<RosterField, string> = {
  name: 'Name',
  email: 'E-mail',
  paidThrough: 'Paid through',
};

/** One row of the file, read as far as it can be read without knowing who is on the roster. */
export interface RosterCells {
  /** Counting the header as line 1 — the number the Administrator's own spreadsheet shows. */
  line: number;
  /**
   * As the file wrote it, trimmed and no more. **Whether two spellings are one person is the
   * roster's rule and not this file's** — `normaliseEmail` owns it, and a second lower-casing
   * here would be a second place for it to be decided.
   */
  email: Reading<string>;
  /** As the file wrote it. Blank is the file saying nothing, which is not the same as nobody. */
  name: string | null;
  paidThrough: Reading<string>;
}

/**
 * How this file writes its dates, settled once for the whole of it.
 *
 * Asked of the column rather than of each cell, because that is where the evidence is: one row
 * reading `31/12/2027` proves the order for every other row beside it. See `readCalendarDay`.
 */
export function dateOrderOf(sheet: Sheet, columns: RosterImportColumns): ProvenDateOrder {
  return dateOrderProvenBy(sheet.rows.map((row) => row.get(columns.paidThrough)));
}

export function readRosterRow(
  row: SheetRow,
  columns: RosterImportColumns,
  order: ProvenDateOrder,
): RosterCells {
  const email = row.get(columns.email);
  const paidThrough = row.get(columns.paidThrough);

  return {
    line: row.line,
    email: readEmail(email),
    name: row.get(columns.name) || null,
    /**
     * **A blank Paid-through is refused rather than treated as no term.** A person recorded with
     * no Membership at all is somebody the roster shows as lapsed who never lapsed — and the
     * ordinary way that cell comes up blank is a column that shifted, which is precisely the
     * accident an import must not carry out quietly.
     */
    paidThrough:
      paidThrough === ''
        ? { ok: false, why: 'This row says nothing about what the Club has been paid for.' }
        : readCalendarDay(paidThrough, order),
  };
}

/**
 * An address the Club could actually write to.
 *
 * Deliberately the same test the roster screen applies — an `@` and something either side of it —
 * rather than a stricter pattern. Every address here is one a member already receives post at, and
 * a validator that knew better than the Club about its own membership would be a validator that
 * left somebody off the roster.
 */
function readEmail(cell: string): Reading<string> {
  const email = cell.trim();
  if (email === '') {
    return { ok: false, why: 'This row has no e-mail address, so there is nobody to record.' };
  }
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
    return { ok: false, why: `"${cell}" is not an e-mail address the Club could write to.` };
  }
  return { ok: true, value: email };
}
