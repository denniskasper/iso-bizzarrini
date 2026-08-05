import type { PastedColumns, PastedPart } from '@ricambi/contracts';
import { readDrawn, readQuantity, type Reading } from '../sheets/cells.js';
import { columnsMatching, type Sheet, type SheetRow } from '../sheets/csv.js';

/**
 * **A Tavola's Listings as a table of text, in both directions** — the rows an Editor pastes out
 * of a spreadsheet, and the sheet the archive writes back out for them (ticket 12).
 *
 * The two are one module because they are one promise. An exported sheet has to be a sheet this
 * archive can *read*, or the round trip creates two hundred duplicates; and the only way to
 * guarantee that is for the columns written and the columns recognised to be the same list,
 * declared once, here.
 *
 * **It is an editing convenience and not the catalog importer** (ADR 0005). What it can do is
 * create and match. What it deliberately cannot do is change a Part that already exists —
 * re-pasting the sheet a Part came from must never be able to overwrite what an Editor has since
 * worked out about it, in bulk, with no record of what was lost.
 */

/** What the archive needs to know about a row, whatever the Editor's own sheet calls its columns. */
export type TableField = keyof PastedColumns;

/**
 * The header the archive writes — **and therefore the one it is guaranteed to read back.**
 *
 * English, because Ricambi is English, except where the factory's own word *is* the term:
 * a Disegno Origine is not a drawing number (CONTEXT.md).
 */
export const TAVOLA_COLUMNS: Record<TableField, string> = {
  position: 'Position',
  catalogNumber: 'Catalog Number',
  nameEn: 'Name (English)',
  nameIt: 'Name (Italian)',
  quantityPerCar: 'Quantity',
  disegnoOrigine: 'Disegno Origine',
  drawn: 'Drawn',
};

/** In the order a printed catalog page prints them, which is the order the export writes. */
export const TAVOLA_HEADER: string[] = [
  TAVOLA_COLUMNS.position,
  TAVOLA_COLUMNS.catalogNumber,
  TAVOLA_COLUMNS.nameEn,
  TAVOLA_COLUMNS.nameIt,
  TAVOLA_COLUMNS.quantityPerCar,
  TAVOLA_COLUMNS.disegnoOrigine,
  TAVOLA_COLUMNS.drawn,
];

/**
 * What each field may be called on a sheet somebody else keeps.
 *
 * **Recognised rather than declared**, which is the difference between this and the migration's
 * plan file. The loader is handed one export a handful of times and a person writes down what its
 * columns mean; an Editor pasting a page is mid-evening and will not fill in a form about their
 * own spreadsheet first. So the archive reads the header, says what it made of it, and shows the
 * consequences before anything is written — which is a stronger guarantee than a declaration,
 * because it is checkable against the rows themselves.
 *
 * Compared with punctuation, accents and case taken out, so `Pos.`, `POS` and `pos` are one name.
 */
const ALIASES: Record<TableField, string[]> = {
  position: ['position', 'pos', 'posizione', 'rif', 'riferimento', 'ref'],
  catalogNumber: [
    'catalog number',
    'catalogue number',
    'catalog no',
    'codice',
    'cod',
    'numero',
    'n catalogo',
    'part number',
    'part no',
  ],
  nameEn: ['name english', 'name en', 'english name', 'english', 'name'],
  nameIt: [
    'name italian',
    'name it',
    'italian name',
    'italian',
    'denominazione',
    'nome',
    'descrizione',
  ],
  quantityPerCar: ['quantity', 'qty', 'q ta', 'qta', 'quantita', 'pcs', 'pieces'],
  disegnoOrigine: ['disegno origine', 'dis origine', 'disegno', 'origine', 'do'],
  drawn: ['drawn', 'disegnato'],
};

/**
 * Which of the pasted table's columns the archive read as what — **reported back rather than
 * assumed**, because a column read as the wrong field is a mistake that would otherwise be
 * discovered two hundred rows later.
 */
export function columnsOf(sheet: Sheet): PastedColumns {
  return columnsMatching<TableField>(sheet, ALIASES);
}

/** Whether the archive made anything at all of the header it was handed. */
export function recognisedAnything(columns: PastedColumns): boolean {
  return Object.values(columns).some((column) => column !== null);
}

/** One pasted row, read as far as it can be read without knowing what the archive already holds. */
export interface PastedCells {
  /** Counting the header as line 1 — the number the Editor's own spreadsheet shows. */
  line: number;
  /** As printed. `null` where the row names none, which is a legitimate Listing. */
  positionNumber: string | null;
  /**
   * What the row says the Part is, or why it could not be read.
   *
   * **Whether it has a name is deliberately not decided here**, because that depends on something
   * this cannot see: a row carrying nothing but a Catalog Number the archive already holds is
   * listing a Part that is already named, and refusing it would refuse the shortest correct row
   * anybody could paste.
   */
  part: Reading<PastedPart>;
}

export function readPastedRow(row: SheetRow, columns: PastedColumns): PastedCells {
  const cell = (field: TableField) => row.get(columns[field]);
  const orNull = (field: TableField) => cell(field) || null;

  const quantity = cell('quantityPerCar');
  const quantityPerCar: Reading<number | null> =
    quantity === '' ? { ok: true, value: null } : readQuantity(quantity);

  /**
   * **A tick column, read the way a tick column reads.** A sheet with a Drawn column says of
   * every row whether the drawing shows that part, and a blank cell in it is that sheet saying
   * *no* — which is what the ticks around it mean. A sheet with no such column at all has said
   * nothing about any of them, and the ordinary catalog row is the drawn one.
   *
   * Anything else is refused rather than guessed. Several *drawn* Parts at a number are
   * alternatives and the *undrawn* ones are needed as well, so a guess here is the wrong parts
   * arriving in the post.
   */
  const drawn: Reading<boolean> =
    columns.drawn === null || cell('drawn') === ''
      ? { ok: true, value: columns.drawn === null }
      : readDrawn(cell('drawn'));

  return {
    line: row.line,
    positionNumber: orNull('position'),
    part: !quantityPerCar.ok
      ? quantityPerCar
      : !drawn.ok
        ? drawn
        : {
            ok: true,
            value: {
              nameEn: orNull('nameEn'),
              nameIt: orNull('nameIt'),
              catalogNumber: orNull('catalogNumber'),
              disegnoOrigine: orNull('disegnoOrigine'),
              quantityPerCar: quantityPerCar.value,
              drawn: drawn.value,
            },
          },
  };
}

/** One Listing on its way out to a spreadsheet, in the columns the paste above reads back. */
export function asTableRow(listing: {
  positionNumber: string | null;
  part: Pick<PastedPart, 'nameEn' | 'nameIt' | 'catalogNumber' | 'disegnoOrigine'>;
  quantityPerCar: number | null;
  drawn: boolean;
}): Record<string, string> {
  return {
    [TAVOLA_COLUMNS.position]: listing.positionNumber ?? '',
    [TAVOLA_COLUMNS.catalogNumber]: listing.part.catalogNumber ?? '',
    [TAVOLA_COLUMNS.nameEn]: listing.part.nameEn ?? '',
    [TAVOLA_COLUMNS.nameIt]: listing.part.nameIt ?? '',
    [TAVOLA_COLUMNS.quantityPerCar]:
      listing.quantityPerCar === null ? '' : String(listing.quantityPerCar),
    [TAVOLA_COLUMNS.disegnoOrigine]: listing.part.disegnoOrigine ?? '',
    // Written in words rather than as a tick, so what comes back is never a blank cell that has
    // to be guessed at. `yes` and `no` are both things `readDrawn` reads.
    [TAVOLA_COLUMNS.drawn]: listing.drawn ? 'yes' : 'no',
  };
}
