import type {
  RosterImportColumns,
  RosterImportPlan,
  RosterImportRow,
  RosterImportTally,
} from '@ricambi/contracts';
import type { Db, DbSession } from '../db/client.js';
import { violates } from '../db/constraints.js';
import type { AccountRow } from '../db/schema.js';
import { ConflictError, ValidationError } from '../http/errors.js';
import { today, type Clock } from '../platform/clock.js';
import { createAccountRepository } from '../repositories/account-repository.js';
import { delimiterOf, readSheet, SheetError } from '../sheets/csv.js';
import {
  dateOrderOf,
  readRosterRow,
  ROSTER_HEADER,
  rosterColumnsOf,
} from '../sheets/roster-table.js';
import { normaliseEmail } from './account-service.js';
import { standingOf } from './roster-service.js';

/**
 * **The Club's annual membership list, loaded instead of typed** (ticket 16).
 *
 * This is the **one permanent import in the product** and ADR 0005 says exactly why: everything
 * else about the archive is curated, so a re-uploaded spreadsheet would overwrite in bulk what an
 * Editor had spent an evening folding into a Part. A roster has no curated state beneath it — the
 * Club's list *is* the truth about who has paid — and it genuinely recurs once a year. That is
 * what earns it an importer, and nothing else has one.
 *
 * Everything it can do, and the two things it deliberately cannot:
 *
 * - it **shows** what a file would do, having written nothing at all;
 * - it **records** the people the roster has never met, with the term the file says they hold;
 * - it **extends** a Membership the file carries further than the roster does, as a new term
 *   rather than an edit of an old one — because the terms are what makes the money auditable;
 * - it **never removes anybody, and never shortens a term**. A truncated or half-exported file is
 *   the ordinary accident here, and the whole point of this being safe is that the worst such a
 *   file can do is nothing. Taking access away is a separate, deliberate act on the roster screen;
 * - and it **never sends an invitation**. A list arriving is not a reason to e-mail a hundred
 *   people, and an import that could would make the first upload of an unchecked roster the most
 *   expensive press in the product.
 *
 * **The preview and the write are the same reading.** Importing re-plans against the roster inside
 * the transaction and then carries that plan out, so a preview cannot promise something the write
 * does differently — the same argument bulk paste and the archive migration both make.
 */
export interface RosterImportService {
  /** What this file would do. Nothing is written, and that is the whole point of it. */
  preview(text: string): Promise<RosterImportPlan>;
  /** The same reading, done again inside the transaction, and then carried out. */
  apply(text: string, importedBy: string | null): Promise<RosterImportPlan>;
}

/** A row, read and resolved: what will be done, and everything needed to do it. */
interface PlannedRow {
  reported: RosterImportRow;
  /** The Account this row is about, where the roster already has one. */
  matched: AccountRow | null;
  /**
   * The term this row grants, or `null` on a row that writes nothing at all.
   *
   * **A term is the only thing an import ever writes**, and this field having no other shape is
   * the ticket's rule sitting in the type: there is no field here that could remove a Membership,
   * shorten one, change a role, or put a name back that somebody has corrected.
   */
  writes: { grantsPaidThrough: string } | null;
}

interface Planned {
  columns: RosterImportColumns;
  rows: PlannedRow[];
  /** People on the roster this file does not mention — the count that proves nothing is deleted. */
  untouched: number;
}

export function createRosterImportService(dependencies: {
  db: Db;
  clock: Clock;
}): RosterImportService {
  const { db, clock } = dependencies;

  /**
   * **The whole reading, in one place** — the file against the roster as it now stands.
   *
   * It works on a `DbSession`, so the caller decides whether that is the pool (a preview, which
   * writes nothing) or the transaction the write happens in. That is what makes the preview the
   * same reading as the write rather than a second implementation of it.
   */
  async function plan(session: DbSession, text: string): Promise<Planned> {
    const accountRepository = createAccountRepository(session);

    if (text.trim() === '') {
      throw new ValidationError('There is nothing in that file to read.');
    }

    const sheet = read(text);
    const columns = rosterColumnsOf(sheet);

    // All three, and refused by name. A file with no e-mail column names nobody the roster could
    // match or record; one with no Paid-through says nothing about what the Club has been paid
    // for; and without a name column, everybody it would add would be somebody with no name.
    const missing = (Object.keys(ROSTER_HEADER) as (keyof RosterImportColumns)[]).filter(
      (field) => columns[field] === null,
    );
    if (missing.length > 0) {
      throw new ValidationError(
        `That file has no column the archive could read as ${missing
          .map((field) => ROSTER_HEADER[field])
          .join(', ')}. It expects a header row naming ` +
          `${Object.values(ROSTER_HEADER).join(', ')}.`,
      );
    }
    if (sheet.rows.length === 0) {
      throw new ValidationError('That is a header row with nobody under it.');
    }

    const order = dateOrderOf(sheet, columns);
    const cells = sheet.rows.map((row) => readRosterRow(row, columns, order));

    // Read once for the whole file rather than once a row: a club roster is a few hundred people,
    // and a round trip each to find out whether the roster already has them is a minute of waiting.
    const [everyone, paidThroughs] = await Promise.all([
      accountRepository.listAll(),
      accountRepository.paidThroughForEveryone(),
    ]);
    const onTheRoster = new Map(everyone.map((account) => [account.email, account]));

    const now = today(clock);
    /** Who this file has already named, so one address twice is not two contradictory rows. */
    const named = new Map<string, number>();
    const matchedAccounts = new Set<string>();
    const rows: PlannedRow[] = [];

    for (const cell of cells) {
      const refuse = (why: string): PlannedRow => ({
        reported: {
          line: cell.line,
          outcome: 'refused',
          why,
          email: cell.email.ok ? normaliseEmail(cell.email.value) : null,
          name: cell.name,
          paidThrough: null,
        },
        matched: null,
        writes: null,
      });

      if (!cell.email.ok) {
        rows.push(refuse(cell.email.why));
        continue;
      }

      const email = normaliseEmail(cell.email.value);
      const namedOnLine = named.get(email);
      if (namedOnLine !== undefined) {
        // Two rows for one address are two claims about one person, and choosing between them is
        // exactly the guess this import does not make.
        rows.push(
          refuse(`Line ${namedOnLine} is about this address as well, and says something else.`),
        );
        continue;
      }
      if (!cell.paidThrough.ok) {
        rows.push(refuse(cell.paidThrough.why));
        continue;
      }

      const paidThrough = cell.paidThrough.value;
      const account = onTheRoster.get(email) ?? null;

      if (account === null) {
        // Asked here rather than while the cells were read, because it depends on this: a blank
        // name cell about somebody already on the roster is the file saying nothing, and the
        // roster keeps the name it has. About somebody new, there is no name to keep.
        if (cell.name === null) {
          rows.push(refuse('This row records somebody new and gives no name for them.'));
          continue;
        }

        // **Claimed only by a row that will actually do something**, so that an unreadable row
        // does not take the address down with it: a bad date on line 5 must not turn a perfectly
        // good line 40 about the same person into a second refusal. A refused row is reported and
        // the rest of the file lands, which is the ticket's rule and not a special case of it.
        named.set(email, cell.line);

        rows.push({
          reported: {
            line: cell.line,
            outcome: 'new-member',
            email,
            name: cell.name,
            paidThrough,
            why: 'Not on the roster. They will be added, and still need inviting.',
          },
          matched: null,
          writes: { grantsPaidThrough: paidThrough },
        });
        continue;
      }

      // Claimed here for the same reason as above: this row is about to say something.
      named.set(email, cell.line);
      matchedAccounts.add(account.id);

      const held = paidThroughs.get(account.id) ?? null;
      const extending = held === null || paidThrough > held;

      const onRoster = {
        name: account.name,
        paidThrough: held,
        standing: standingOf(account, held, now),
      };

      /**
       * **What the file calls somebody it did not put on the roster, said and not written.**
       *
       * This is the one thing an import could overwrite that somebody has curated: an
       * Administrator corrects a name on the roster screen, and a stale annual export uploaded
       * next spring would put the old one back — in bulk, with no record of what was lost, which
       * is the exact failure ADR 0005 exists to prevent. So the difference is reported and the
       * roster keeps its own, which is what bulk paste does with a quantity for the same reason.
       * Correcting a name is one press on the row that owns it.
       */
      const calledDifferently =
        cell.name !== null && cell.name !== account.name
          ? `This file calls them ${cell.name}, and the roster has ${account.name}. ` +
            'Nothing here changes it — correct it on the roster if the file is right.'
          : null;

      if (!extending) {
        rows.push({
          reported: {
            line: cell.line,
            outcome: 'unchanged',
            email,
            name: cell.name,
            paidThrough,
            onTheRoster: onRoster,
            why: [
              held === paidThrough
                ? 'The roster already runs to this date.'
                : `The roster already runs to ${held}, which is further. Nothing here shortens it.`,
              calledDifferently,
            ]
              .filter((part) => part !== null)
              .join(' '),
          },
          matched: account,
          writes: null,
        });
        continue;
      }

      const said = [
        `Their Membership runs to ${paidThrough} instead of ${held ?? 'no term at all'}.`,
        calledDifferently,
      ].filter((part) => part !== null);

      rows.push({
        reported: {
          line: cell.line,
          outcome: 'updated',
          email,
          name: cell.name,
          paidThrough,
          onTheRoster: onRoster,
          why: said.join(' '),
        },
        matched: account,
        writes: { grantsPaidThrough: paidThrough },
      });
    }

    return { columns, rows, untouched: everyone.length - matchedAccounts.size };
  }

  /**
   * **The plan, carried out** — and nothing else. Every write here either records somebody the
   * roster has never had or grants them a term it has not got; there is no statement in this
   * function that removes anything or moves a date backwards, which is the ticket's rule made
   * structural rather than checked.
   *
   * Everything happens in the caller's transaction: an import is one press, and half a membership
   * list written is a roster nobody can reason about.
   */
  async function carryOut(
    session: DbSession,
    planned: Planned,
    importedBy: string | null,
  ): Promise<void> {
    const accountRepository = createAccountRepository(session);
    const now = clock.now();

    for (const row of planned.rows) {
      if (!row.writes) {
        continue;
      }

      let accountId = row.matched?.id ?? null;
      if (accountId === null) {
        const { email, name } = row.reported;
        if (email === null || name === null) {
          throw new Error(`Line ${row.reported.line} was planned to record somebody unnamed.`);
        }
        // Recorded as a Member and never as anything else. Appointing an Editor is a decision an
        // Administrator makes on the roster screen (story 129), not a column somebody's
        // spreadsheet could carry.
        const added = await accountRepository.add({ email, name, role: 'member', addedAt: now });
        accountId = added.id;
      }

      // A new row and never an edit, exactly as a recorded payment is (story 125): the term the
      // Club was granted is what it was granted, and ADR 0007's retention period has to have
      // something to retain.
      await accountRepository.grantMembership({
        accountId,
        paidThrough: row.writes.grantsPaidThrough,
        grantedBy: 'roster-import',
        recordedBy: importedBy,
        recordedAt: now,
      });
    }
  }

  function respond(planned: Planned, applied: boolean): RosterImportPlan {
    const rows = planned.rows.map((row) => row.reported);
    return { applied, columns: planned.columns, rows, tally: tallyOf(rows, planned.untouched) };
  }

  return {
    async preview(text) {
      return respond(await plan(db, text), false);
    },

    async apply(text, importedBy) {
      return db
        .transaction(async (session) => {
          const planned = await plan(session, text);
          await carryOut(session, planned, importedBy);
          return respond(planned, true);
        })
        .catch((error: unknown) => {
          // Somebody was added on the roster screen between the reading and the write. Nothing is
          // written, which is the honest answer: the Administrator uploads the file again and it
          // is read against a roster that now has them.
          if (violates(error, 'accounts_email_unique')) {
            throw new ConflictError(
              'Somebody in that file was added to the roster while it was being read. ' +
                'Nothing was written — upload it again and they will be matched.',
            );
          }
          throw error;
        });
    },
  };
}

/**
 * The file as a table.
 *
 * `SheetError` is what an unclosed quote or two columns of one name come back as, and both are
 * things about the Administrator's file rather than about this archive — so they are said back
 * rather than logged as a fault.
 */
function read(text: string) {
  try {
    return readSheet('That file', text, delimiterOf(text));
  } catch (error: unknown) {
    if (error instanceof SheetError) {
      throw new ValidationError(error.message);
    }
    throw error;
  }
}

function tallyOf(rows: RosterImportRow[], untouched: number): RosterImportTally {
  const counted = (outcome: RosterImportRow['outcome']) =>
    rows.filter((row) => row.outcome === outcome).length;

  return {
    newMembers: counted('new-member'),
    updated: counted('updated'),
    unchanged: counted('unchanged'),
    refused: counted('refused'),
    untouched,
  };
}
