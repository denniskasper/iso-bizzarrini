import type {
  PastePlanResponse,
  PastedColumns,
  PastedPart,
  PastedRow,
  PasteTally,
} from '@ricambi/contracts';
import { catalogNumberKey, unnumberedPartKey } from '../catalog/part-identity.js';
import {
  asTableRow,
  columnsOf,
  readPastedRow,
  recognisedAnything,
  TAVOLA_HEADER,
} from '../catalog/tavola-table.js';
import type { Db, DbSession } from '../db/client.js';
import { violates } from '../db/constraints.js';
import { ConflictError, NotFoundError, ValidationError } from '../http/errors.js';
import type { PartRow } from '../db/schema.js';
import { createPartRepository } from '../repositories/part-repository.js';
import { createPositionRepository } from '../repositories/position-repository.js';
import { createTavolaRepository } from '../repositories/tavola-repository.js';
import { delimiterOf, readSheet, SheetError, writeSheet } from '../sheets/csv.js';
import { toPart } from './catalog-view.js';

/**
 * **A whole catalog page at once, and a way back out into a spreadsheet** (ticket 12).
 *
 * An evening's transcription is two hundred rows, and two hundred forms is why volunteers stop.
 * This is the concession that keeps a spreadsheet-native Editor productive without making the
 * spreadsheet the source of truth — losing an Editor is worse than any schema decision.
 *
 * Three things it does, and one it deliberately does not:
 *
 * - it **shows** what a paste would do, having written nothing at all;
 * - it **creates** the Parts the archive has never met, with their Listings;
 * - it **matches** the ones it already has, by the same identity rule the rest of the archive
 *   uses, so a Part on six drawings stays one Part (ADR 0001);
 * - and it **never changes a Part that already exists**. Re-pasting the sheet a Part came from
 *   would otherwise overwrite, in bulk and with no record of what was lost, everything an Editor
 *   has since folded into it — which is the exact reason there is no catalog importer here
 *   (ADR 0005). Correcting a Part is a screen where one Part is in front of one person.
 *
 * **The preview and the write are the same reading.** Applying re-plans against the archive
 * inside the transaction and then carries that plan out, so a preview cannot promise something
 * the write does differently — the same argument the archive migration makes about its dry run,
 * and the reason there is one code path here rather than two free to disagree.
 */

export interface BulkPasteService {
  /** What this text would do. Nothing is written, and that is the whole point of it. */
  preview(tavolaId: string, text: string): Promise<PastePlanResponse>;
  /** The same reading, done again inside the transaction, and then carried out. */
  apply(tavolaId: string, text: string): Promise<PastePlanResponse>;
  /** The drawing as a spreadsheet — in the columns a paste reads back (story 114). */
  spreadsheet(tavolaId: string): Promise<{ filename: string; csv: string }>;
}

/**
 * Which Part a row turned out to be about.
 *
 * The three are the whole of the matching rule. `existing` is a Part the archive holds;
 * `creates` is a row that will record one; `from` is a row naming a Part an **earlier line of
 * this same paste** creates, which is one catalog number printed at two numbers on one page and
 * not two Parts.
 */
type Identity =
  { kind: 'existing'; part: PartRow } | { kind: 'creates' } | { kind: 'from'; line: number };

/**
 * A row, read and resolved: what will be done, and everything needed to do it.
 *
 * **A refused row has no identity and no Part**, and both are null rather than a stand-in. It is
 * about to do nothing, and a row carrying `creates` while creating nothing is a shape that reads
 * as a decision somebody made.
 */
interface PlannedRow {
  reported: PastedRow;
  identity: Identity | null;
  part: PastedPart | null;
}

interface Planned {
  columns: PastedColumns;
  rows: PlannedRow[];
}

export function createBulkPasteService(dependencies: { db: Db }): BulkPasteService {
  const { db } = dependencies;

  /** What identifies a Listing within a plan: this Part, at this number on this sheet. */
  const placed = (identity: Identity, line: number, positionNumber: string | null) =>
    JSON.stringify([
      identity.kind === 'existing'
        ? identity.part.id
        : `line ${identity.kind === 'from' ? identity.line : line}`,
      positionNumber,
    ]);

  /** Said the same way wherever a row turns out to be a row somebody has already typed. */
  const typedTwice = (line: number) => `Line ${line} already lists this at that number.`;

  /**
   * **The whole reading, in one place** — the pasted text against the archive as it now stands.
   *
   * It works on a `DbSession`, so the caller decides whether that is the pool (a preview, which
   * writes nothing) or the transaction the write happens in. That is what makes the preview the
   * same reading as the write rather than a second implementation of it.
   */
  async function plan(session: DbSession, tavolaId: string, text: string): Promise<Planned> {
    const tavolaRepository = createTavolaRepository(session);
    const partRepository = createPartRepository(session);

    if (!(await tavolaRepository.exists(tavolaId))) {
      throw new NotFoundError('No such Tavola.');
    }

    if (text.trim() === '') {
      throw new ValidationError('There is nothing here to paste.');
    }

    const table = read(text);
    const columns = columnsOf(table);
    if (!recognisedAnything(columns)) {
      throw new ValidationError(
        'None of those columns are ones the archive reads. It expects a header row naming ' +
          `${TAVOLA_HEADER.join(', ')} — and will take a sheet with only some of them.`,
      );
    }
    if (table.rows.length === 0) {
      throw new ValidationError('That is a header row with no rows under it.');
    }

    const cells = table.rows.map((row) => readPastedRow(row, columns));

    // Read once for the whole paste rather than once a row: a catalog page is two hundred rows,
    // and two hundred round trips to find out what the archive already has is a minute of waiting.
    const [onSheet, listed, byNumber] = await Promise.all([
      createPositionRepository(session).listByTavola(tavolaId),
      partRepository.listOnTavola(tavolaId),
      partRepository.findPartsByCatalogNumbers(
        cells.flatMap((row) =>
          row.part.ok && row.part.value.catalogNumber ? [row.part.value.catalogNumber] : [],
        ),
      ),
    ]);

    const numbersOnSheet = new Set(onSheet.map((position) => position.number));
    const archiveByNumber = new Map(
      byNumber.map((part) => [catalogNumberKey(part.catalogNumber ?? ''), part]),
    );

    /**
     * The unnumbered Parts already listed on this sheet, by where they sit and what they are
     * called — **several to a key, and taken one at a time.**
     *
     * Two unnumbered Parts under one name at one number is an ordinary state (GLOSSARY.md: several
     * Parts at a Position are alternatives), and there is no number to tell them apart, so the key
     * genuinely names both. A map holding one of them would quietly drop the other — and then a
     * sheet exported with two such rows would come back with the second refused as a duplicate of
     * the first, which is the round trip failing on exactly the case that needed it most.
     *
     * So each pasted row takes the first that no earlier row has taken. Two rows, two Parts; three
     * rows against two Parts, and the third is genuinely new.
     */
    const archiveUnnumbered = new Map<string, PartRow[]>();
    for (const listing of listed) {
      if (listing.part.catalogNumber !== null) {
        continue;
      }
      const key = unnumberedPartKey({
        positionNumber: listing.position?.number ?? null,
        nameEn: listing.part.nameEn,
        nameIt: listing.part.nameIt,
      });
      archiveUnnumbered.set(key, [...(archiveUnnumbered.get(key) ?? []), listing.part]);
    }

    /** Which Parts this sheet already lists, at which number, and with what recorded there. */
    const alreadyListed = new Map(
      listed.map((listing) => [
        JSON.stringify([listing.part.id, listing.position?.number ?? null]),
        listing,
      ]),
    );

    /** What this paste has decided so far, so that a row can be read against its own page. */
    const createdByNumber = new Map<string, number>();
    const createdUnnumbered = new Map<string, number>();
    const plannedListings = new Map<string, number>();
    const newPositions = new Set<string>();

    const rows: PlannedRow[] = [];

    for (const row of cells) {
      const refuse = (why: string): PlannedRow => ({
        reported: {
          line: row.line,
          outcome: 'refused',
          why,
          positionNumber: row.positionNumber,
          newPosition: false,
        },
        identity: null,
        part: null,
      });

      if (!row.part.ok) {
        rows.push(refuse(row.part.why));
        continue;
      }

      const part = row.part.value;
      const number = part.catalogNumber === null ? null : catalogNumberKey(part.catalogNumber);
      const key = unnumberedPartKey({ ...part, positionNumber: row.positionNumber });

      let identity: Identity;
      if (number !== null) {
        const fromThisPaste = createdByNumber.get(number);
        const inArchive = archiveByNumber.get(number);
        identity = fromThisPaste
          ? { kind: 'from', line: fromThisPaste }
          : inArchive
            ? { kind: 'existing', part: inArchive }
            : { kind: 'creates' };
      } else {
        const fromThisPaste = createdUnnumbered.get(key);
        if (fromThisPaste) {
          // Same number, same names, no Catalog Number — this row and that one are one row typed
          // twice. Nothing distinguishes them, so nothing could tell the two Listings apart.
          rows.push(refuse(typedTwice(fromThisPaste)));
          continue;
        }
        // The first the archive holds under this key that no earlier row has taken — see
        // `archiveUnnumbered`. Taken, so the next row with these names finds the next Part.
        const waiting = archiveUnnumbered.get(key) ?? [];
        const inArchive = waiting.shift();
        identity = inArchive ? { kind: 'existing', part: inArchive } : { kind: 'creates' };
      }

      // Asked here rather than while the cells were read, because it depends on this: a row
      // carrying nothing but a number the archive already holds is listing a Part that is
      // already named, and there is nothing to ask it for.
      if (identity.kind === 'creates' && part.nameEn === null && part.nameIt === null) {
        rows.push(refuse('A Part needs a name in English or in Italian.'));
        continue;
      }

      const where = placed(identity, row.line, row.positionNumber);
      const twice = plannedListings.get(where);
      if (twice !== undefined) {
        rows.push(refuse(typedTwice(twice)));
        continue;
      }
      plannedListings.set(where, row.line);

      const already =
        identity.kind === 'existing'
          ? (alreadyListed.get(JSON.stringify([identity.part.id, row.positionNumber])) ?? null)
          : null;

      // Only a row that will actually be written can add a number to the sheet, and only the
      // first such row adds any one number — the rows after it find what that one recorded.
      const newPosition =
        already === null &&
        row.positionNumber !== null &&
        !numbersOnSheet.has(row.positionNumber) &&
        !newPositions.has(row.positionNumber);
      if (newPosition && row.positionNumber !== null) {
        newPositions.add(row.positionNumber);
      }

      if (identity.kind === 'creates') {
        if (number !== null) {
          createdByNumber.set(number, row.line);
        } else {
          createdUnnumbered.set(key, row.line);
        }
      }

      const differs = already === null ? null : whatDiffers(part, already, columns.drawn !== null);

      rows.push({
        identity,
        part,
        reported: {
          line: row.line,
          outcome:
            already !== null
              ? 'already-listed'
              : identity.kind === 'creates'
                ? 'new-part'
                : 'matched-part',
          positionNumber: row.positionNumber,
          newPosition,
          part,
          ...(differs ? { why: differs } : {}),
          ...(identity.kind === 'existing' ? { matched: toPart(identity.part) } : {}),
          ...(identity.kind === 'from' ? { matchedLine: identity.line } : {}),
        },
      });
    }

    return { columns, rows };
  }

  /**
   * **The plan, carried out** — in the order it was pasted, so that a Part recorded by one line
   * is there for the line that names it again.
   *
   * Everything happens in the caller's transaction: a paste is one press, and half a catalog page
   * written is worse than none of it. What it never does is touch a Part it matched.
   */
  async function carryOut(session: DbSession, tavolaId: string, planned: Planned): Promise<void> {
    const partRepository = createPartRepository(session);
    const positionRepository = createPositionRepository(session);

    const positionIds = new Map<string, string>();
    const createdByLine = new Map<number, string>();

    for (const row of planned.rows) {
      // A refused row has no identity and nothing to write; an already-listed one is already
      // exactly what it says it is, and writing it again is the duplicate this exists to avoid.
      if (row.reported.outcome !== 'new-part' && row.reported.outcome !== 'matched-part') {
        continue;
      }
      if (!row.identity || !row.part) {
        throw new Error(
          `Line ${row.reported.line} was planned to be written with nothing to write.`,
        );
      }

      const number = row.reported.positionNumber;
      let positionId: string | null = null;
      if (number !== null) {
        positionId = positionIds.get(number) ?? null;
        if (positionId === null) {
          const { position } = await positionRepository.findOrAdd({ tavolaId, number });
          positionId = position.id;
          positionIds.set(number, positionId);
        }
      }

      const partId = await partFor(
        partRepository,
        row.identity,
        row.part,
        row.reported.line,
        createdByLine,
      );
      await partRepository.addListing({
        partId,
        tavolaId,
        positionId,
        quantityPerCar: row.part.quantityPerCar,
        drawn: row.part.drawn,
      });
    }
  }

  /** The Part this row is about: the one the archive holds, the one a line above made, or a new one. */
  async function partFor(
    partRepository: ReturnType<typeof createPartRepository>,
    identity: Identity,
    part: PastedPart,
    line: number,
    createdByLine: Map<number, string>,
  ): Promise<string> {
    if (identity.kind === 'existing') {
      return identity.part.id;
    }
    if (identity.kind === 'from') {
      const earlier = createdByLine.get(identity.line);
      if (!earlier) {
        throw new Error(`Line ${line} names a Part line ${identity.line} did not record.`);
      }
      return earlier;
    }

    const recorded = await partRepository.addPart({
      nameEn: part.nameEn,
      nameIt: part.nameIt,
      catalogNumber: part.catalogNumber,
      disegnoOrigine: part.disegnoOrigine,
      description: null,
      dimensions: null,
      materialFinish: null,
      catalogNote: null,
      note: null,
    });
    createdByLine.set(line, recorded.id);
    return recorded.id;
  }

  function respond(planned: Planned, applied: boolean): PastePlanResponse {
    return {
      applied,
      columns: planned.columns,
      rows: planned.rows.map((row) => row.reported),
      tally: tallyOf(planned.rows.map((row) => row.reported)),
    };
  }

  return {
    async preview(tavolaId, text) {
      return respond(await plan(db, tavolaId, text), false);
    },

    async apply(tavolaId, text) {
      return db
        .transaction(async (session) => {
          const planned = await plan(session, tavolaId, text);
          await carryOut(session, tavolaId, planned);
          return respond(planned, true);
        })
        .catch((error: unknown) => {
          // Another Editor recorded one of these numbers between the reading and the write. The
          // whole paste is back off, which is the honest answer: half a catalog page is worse
          // than none of it, and the Editor pastes it again against an archive that now has it.
          if (violates(error, 'parts_catalog_number_unique')) {
            throw new ConflictError(
              'One of those catalog numbers was recorded while this paste was being read. ' +
                'Nothing was written — read it again and the archive will match that Part.',
            );
          }
          throw error;
        });
    },

    async spreadsheet(tavolaId) {
      const tavola = await createTavolaRepository(db).findById(tavolaId);
      if (!tavola) {
        throw new NotFoundError('No such Tavola.');
      }

      const listings = await createPartRepository(db).listOnTavola(tavolaId);
      const csv = writeSheet(
        TAVOLA_HEADER,
        listings.map((listing) =>
          asTableRow({
            positionNumber: listing.position?.number ?? null,
            part: listing.part,
            quantityPerCar: listing.quantityPerCar,
            drawn: listing.drawn,
          }),
        ),
      );

      return { filename: fileNameFor(tavola.number, tavola.nameEn), csv };
    },
  };
}

/**
 * The pasted text as a table.
 *
 * `SheetError` is what an unclosed quote or two columns of one name come back as, and both are
 * things about the Editor's paste rather than about this archive — so they are said back rather
 * than logged as a fault.
 */
function read(text: string) {
  try {
    return readSheet('That paste', text, delimiterOf(text));
  } catch (error: unknown) {
    if (error instanceof SheetError) {
      throw new ValidationError(error.message);
    }
    throw error;
  }
}

/**
 * **Where a row that changes nothing nonetheless disagrees with what is recorded** — and the one
 * silent hole a paste would otherwise have.
 *
 * An Editor exports a drawing, corrects a quantity in the spreadsheet they are comfortable in,
 * and pastes it back. The Part is matched, the Listing is already there, and nothing is written —
 * which is right, because a bulk write over curated records is the thing this archive does not do
 * (ADR 0005). What would be wrong is not saying so. The correction is one press away on the panel
 * that owns it; being told is what makes that press happen.
 *
 * A **blank** quantity is not a disagreement: it is the sheet saying nothing, which is different
 * from the sheet saying none. And `drawn` is only compared where the sheet has a column for it,
 * for the same reason — a sheet with no Drawn column has made no claim about any row.
 */
function whatDiffers(
  pasted: PastedPart,
  recorded: { quantityPerCar: number | null; drawn: boolean },
  saysDrawn: boolean,
): string | null {
  const differences: string[] = [];
  if (pasted.quantityPerCar !== null && pasted.quantityPerCar !== recorded.quantityPerCar) {
    differences.push(
      `this row says ${pasted.quantityPerCar} fitted and the archive has ` +
        `${recorded.quantityPerCar ?? 'no count'}`,
    );
  }
  if (saysDrawn && pasted.drawn !== recorded.drawn) {
    differences.push(
      `this row says ${pasted.drawn ? 'drawn' : 'not drawn'} and the archive has ` +
        `${recorded.drawn ? 'drawn' : 'not drawn'}`,
    );
  }

  return differences.length === 0
    ? null
    : `Already listed, and ${differences.join(', ')}. Nothing here changes it — correct it where it sits.`;
}

function tallyOf(rows: PastedRow[]): PasteTally {
  return {
    newParts: rows.filter((row) => row.outcome === 'new-part').length,
    matchedParts: rows.filter((row) => row.outcome === 'matched-part').length,
    alreadyListed: rows.filter((row) => row.outcome === 'already-listed').length,
    refused: rows.filter((row) => row.outcome === 'refused').length,
    newPositions: rows.filter((row) => row.newPosition).length,
  };
}

/**
 * What the downloaded file is called — the drawing's number and its English name, which is how
 * an Editor with a folder of them will be looking for it.
 */
function fileNameFor(number: string, nameEn: string): string {
  const slug = `tavola-${number}-${nameEn}`
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${slug}.csv`;
}
