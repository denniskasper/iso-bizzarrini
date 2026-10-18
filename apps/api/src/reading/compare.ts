import type { ReadRow, UnsureField } from './reading-method.js';

/**
 * A row as both Readings of its Table sheet left it: what was read, what is in doubt, and what is
 * only worth a glance.
 */
export interface ComparedRow {
  row: ReadRow;
  /**
   * **What an Editor has to look at.** Only a disagreement over what a Part is ordered by — its
   * Position, its Catalog Number, its quantity — or a Catalog Number not shaped like one. A
   * different spelling of the name is not a doubt: nobody orders by it, and counted as doubts
   * they bury the few rows that matter.
   */
  doubts: string[];
  /** A Reading's own hesitation where the other read the same. A note, never a doubt. */
  notes: string[];
}

const FIELD_NAMES: Record<UnsureField, string> = {
  position: 'the Position',
  numbers: 'the Catalog Number',
  quantity: 'the quantity',
};

/**
 * Shapes like `208503`, `208505/01` and `208505/01/D`, with the printed spacing taken out. The
 * factory's numbers are five or six digits, sometimes followed by a variant after a slash.
 */
const CATALOG_NUMBER = /^\d{5,6}(\/[A-Z0-9]+)*$/;

/** A value with what printing and reading vary taken out of it: spaces, dots, case. */
export function squash(value: string): string {
  return value.replace(/[\s.]/g, '').toUpperCase();
}

export function isShapedLikeACatalogNumber(number: string): boolean {
  return CATALOG_NUMBER.test(squash(number));
}

/** The two Readings of one Table sheet, put side by side. */
export function compareReadings(first: ReadRow[], second: ReadRow[]): ComparedRow[] {
  return pairRows(first, second).map(([a, b]) => compareRow(a, b));
}

function compareRow(a: ReadRow | null, b: ReadRow | null): ComparedRow {
  const row = (a ?? b) as ReadRow;
  const doubts: string[] = [];
  const notes: string[] = [];

  if (a === null || b === null) {
    doubts.push('Only one of the two Readings has this row');
  } else {
    const differ = new Set<UnsureField>();
    const check = (field: UnsureField, left: string, right: string, shown: string) => {
      if (left !== right) {
        differ.add(field);
        doubts.push(
          `${capitalised(FIELD_NAMES[field])}: the other Reading has “${shown || 'nothing'}”`,
        );
      }
    };
    check('position', squash(a.position), squash(b.position), b.position);
    check(
      'numbers',
      numbersOf(a).join(' '),
      numbersOf(b).join(' '),
      b.numbers.map((entry) => entry.number).join(', '),
    );
    check('quantity', squash(a.quantity), squash(b.quantity), b.quantity);

    const hesitated = new Set([...a.unsure, ...b.unsure]);
    for (const field of Object.keys(FIELD_NAMES) as UnsureField[]) {
      if (hesitated.has(field) && !differ.has(field)) {
        notes.push(`One Reading hesitated over ${FIELD_NAMES[field]}; the other read the same`);
      }
    }
  }

  for (const { number } of row.numbers) {
    if (number.trim() !== '' && !isShapedLikeACatalogNumber(number)) {
      doubts.push(`“${number}” is not shaped like a Catalog Number`);
    }
  }

  return { row, doubts: [...new Set(doubts)], notes };
}

function numbersOf(row: ReadRow): string[] {
  return row.numbers.map((entry) => squash(entry.number)).filter((number) => number !== '');
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Lines the two Readings' rows up by their Position, so a row one of them missed does not shift
 * every row after it into a disagreement.
 *
 * The longest run of Positions the two have in common is matched first. Between two matches, a
 * stretch of the same length on both sides is paired row for row — the same rows, read
 * differently — and anything else is a row only one Reading has.
 */
function pairRows(first: ReadRow[], second: ReadRow[]): [ReadRow | null, ReadRow | null][] {
  const key = (row: ReadRow) => squash(row.position) || '·';
  const a = first.map(key);
  const b = second.map(key);

  // lengths[i][j]: the longest common run of a[i..] and b[j..].
  const lengths = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i]![j] =
        a[i] === b[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }

  const pairs: [ReadRow | null, ReadRow | null][] = [];
  let gapA: ReadRow[] = [];
  let gapB: ReadRow[] = [];
  const closeGap = () => {
    if (gapA.length === gapB.length) {
      gapA.forEach((row, index) => pairs.push([row, gapB[index]!]));
    } else {
      gapA.forEach((row) => pairs.push([row, null]));
      gapB.forEach((row) => pairs.push([null, row]));
    }
    gapA = [];
    gapB = [];
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      closeGap();
      pairs.push([first[i]!, second[j]!]);
      i += 1;
      j += 1;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      gapA.push(first[i]!);
      i += 1;
    } else {
      gapB.push(second[j]!);
      j += 1;
    }
  }
  gapA.push(...first.slice(i));
  gapB.push(...second.slice(j));
  closeGap();

  return pairs;
}
