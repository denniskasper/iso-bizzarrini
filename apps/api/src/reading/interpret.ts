import { squash, type ComparedRow } from './compare.js';
import type { TableLayout } from './reading-method.js';

/**
 * One Listing as read off the factory's table — one row of the file an Editor may correct
 * before it is loaded.
 */
export interface ReadListing {
  /** `''` where nothing says which Position it sits at. */
  position: string;
  drawn: boolean;
  catalogNumber: string;
  disegnoOrigine: string;
  quantity: string;
  nameIt: string;
  catalogNote: string;
  /** The *Dal–Al* heading the Catalog Number stood under, verbatim; `''` where there is none. */
  fitmentQualifier: string;
  /** Which of the Tavola's Table sheets it was read from, counting from 1. */
  tableSheet: number;
  doubts: string[];
  notes: string[];
}

/** One Table sheet's rows, both Readings compared, and which layout it is printed in. */
export interface ComparedSheet {
  layout: TableLayout;
  ranges: string[];
  rows: ComparedRow[];
}

/**
 * **What the factory meant by its table**, written once and applied to whatever read it.
 *
 * - A **dash** for a position is the Position above: on the catalogue layout an undrawn Part
 *   fitted there as well — the screw that holds the bracket — and on the Ufficio Tecnico layout
 *   a drawn Part of the other hand. An empty position cell is read the same way.
 * - A **repeated** position number is drawn alternatives, which needs nothing doing: they are
 *   two rows at one Position, both drawn.
 * - A **range** (`16-17`) is one Part listed at each Position in it.
 * - Where the *Dal–Al* columns hold **different numbers**, they are separate Parts, each with the
 *   heading of the columns it stood under as its Fitment qualifier.
 *
 * The sheets are taken in order, so a dash at the top of a sheet is the last Position of the one
 * before.
 */
export function interpretTable(sheets: ComparedSheet[]): ReadListing[] {
  const listings: ReadListing[] = [];
  let above: string[] = [];

  sheets.forEach((sheet, index) => {
    for (const { row, doubts, notes } of sheet.rows) {
      // The catalogue's form has 1 to 50 printed down its edge, and a number with nothing typed
      // beside it is the form rather than a Position.
      if (sheet.layout === 'catalogue' && row.nameIt === '' && row.numbers.length === 0) {
        continue;
      }

      const rowDoubts = [...doubts];
      const printed = row.position.trim().replace(/[–—]/g, '-');
      let positions: string[];
      let drawn = true;

      if (printed === '' || printed === '-') {
        drawn = sheet.layout === 'ufficio-tecnico';
        if (above.length === 0) {
          rowDoubts.push('A dash with no Position above it');
          positions = [''];
        } else {
          positions = above;
        }
      } else {
        positions = rangeOf(printed) ?? [printed];
        above = positions;
      }

      for (const part of partsOf(row.numbers, sheet)) {
        for (const position of positions) {
          listings.push({
            position,
            drawn,
            catalogNumber: part.number,
            disegnoOrigine: row.disegnoOrigine,
            quantity: row.quantity,
            nameIt: row.nameIt,
            catalogNote: row.note,
            fitmentQualifier: part.qualifier,
            tableSheet: index + 1,
            doubts: rowDoubts,
            notes,
          });
        }
      }
    }
  });

  return listings;
}

/** `16-17` as `16`, `17`. Anything else — `210 S`, a descending pair — is a number as printed. */
function rangeOf(printed: string): string[] | null {
  const match = /^(\d+)\s*-\s*(\d+)$/.exec(printed);
  if (!match) {
    return null;
  }
  const from = Number(match[1]);
  const to = Number(match[2]);
  if (to <= from) {
    return null;
  }
  return Array.from({ length: to - from + 1 }, (_, offset) => String(from + offset));
}

/**
 * The Parts one row stands for: one per distinct Catalog Number on it, and one with none where
 * the row has no number at all.
 *
 * A number that stands under every *Dal–Al* column fits throughout and needs no qualifier; one
 * that stands under some of them fits those, and says so in their words.
 */
function partsOf(
  numbers: { number: string; range: string }[],
  sheet: ComparedSheet,
): { number: string; qualifier: string }[] {
  const printed = numbers.filter((entry) => entry.number.trim() !== '');
  if (printed.length === 0) {
    return [{ number: '', qualifier: '' }];
  }

  const byNumber = new Map<string, { number: string; ranges: string[] }>();
  for (const entry of printed) {
    const key = squash(entry.number);
    const found = byNumber.get(key) ?? { number: entry.number.trim(), ranges: [] };
    if (entry.range.trim() !== '') {
      found.ranges.push(entry.range.trim());
    }
    byNumber.set(key, found);
  }

  const columns = new Set(sheet.ranges.map((range) => range.trim()));
  return [...byNumber.values()].map(({ number, ranges }) => {
    const throughout =
      ranges.length === 0 ||
      (columns.size > 0 && [...columns].every((range) => ranges.includes(range)));
    return { number, qualifier: throughout ? '' : [...new Set(ranges)].join('; ') };
  });
}
