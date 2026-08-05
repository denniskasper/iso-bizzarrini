/**
 * A table of text, read and written — the club's spreadsheets, and the rows an Editor pastes out
 * of one.
 *
 * **CSV rather than a workbook**, and that is a decision rather than a shortcut. A spreadsheet
 * file would need a parsing library in the production image for the sake of one command that is
 * run a handful of times; *File → Save as CSV* costs a volunteer one menu item, and what comes
 * out is a file that can be read, diffed and quoted in a bug report by anybody. The sheets
 * themselves are never committed here (`AGENTS.md`) — the plan that describes them is.
 *
 * RFC 4180 with two concessions to what Excel actually writes: a byte-order mark at the front,
 * and a delimiter that is a semicolon wherever the decimal separator is a comma. A clipboard is
 * a third: what a spreadsheet puts on it is tab-separated, which is the same grammar with a
 * different character between the cells.
 *
 * **It lives here and not under `migration/` because it is no longer only the migration's.** The
 * loader is a script that runs a handful of times and is deliberately not a product feature
 * (ADR 0005); bulk paste and spreadsheet export are the Editor's, on every request. One reader
 * serves both, which is what keeps an exported sheet a sheet this archive can read back.
 */
export interface Sheet {
  /** The file's name, so a problem can be reported where somebody can go and look at it. */
  file: string;
  columns: string[];
  rows: SheetRow[];
}

export interface SheetRow {
  /**
   * The line the record starts on, counting the header as line 1. It is the number the
   * spreadsheet's own row indicator shows, which is the only address a volunteer has.
   */
  line: number;
  /**
   * A cell, trimmed. `''` both for a blank cell and for a column the plan did not name, so a
   * caller reading an optional column asks for it the same way either way.
   */
  get(column: string | null | undefined): string;
}

export class SheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SheetError';
  }
}

export function readSheet(file: string, text: string, delimiter = ','): Sheet {
  if (delimiter.length !== 1) {
    throw new SheetError(`A delimiter is one character; "${delimiter}" is not.`);
  }

  // The byte-order mark Excel writes at the front, which would otherwise become part of the
  // first column's name and make every lookup against it miss.
  const records = parseRecords(text.replace(/^\uFEFF/, ''), delimiter);
  const header = records[0];
  if (!header) {
    throw new SheetError(`${file} is empty — it has not even a header row.`);
  }

  const columns = header.cells.map((cell) => cell.trim());
  const duplicated = columns.filter((column, index) => columns.indexOf(column) !== index);
  if (duplicated.length > 0) {
    // Two columns of one name is a sheet where "which one did it read" has no answer.
    throw new SheetError(`${file} has more than one column called "${duplicated[0]}".`);
  }

  const rows = records.slice(1).map((record) => ({
    line: record.line,
    get(column: string | null | undefined): string {
      if (!column) {
        return '';
      }
      const index = columns.indexOf(column);
      return index === -1 ? '' : (record.cells[index] ?? '').trim();
    },
  }));

  return {
    file,
    columns,
    // A trailing newline, and the blank lines a spreadsheet leaves under a table, are not rows.
    rows: rows.filter((row) => columns.some((column) => row.get(column) !== '')),
  };
}

/**
 * What separates the cells of a table somebody has just handed us.
 *
 * **A clipboard is not a file, and this is the one place that matters.** A spreadsheet copies
 * rows out tab-separated, a *Save as CSV* on an English machine writes commas, and on a German
 * or Italian one — where the decimal separator is already a comma — it writes semicolons. All
 * three arrive in the same textarea, so the header line is asked rather than the Editor.
 *
 * The header is what is sniffed and not the whole text, because a *cell* may legitimately hold a
 * comma; a header row holds column names and the delimiter between them.
 */
export function delimiterOf(text: string): string {
  const header = text.replace(/^\uFEFF/, '').split('\n', 1)[0] ?? '';
  const count = (character: string) => header.split(character).length - 1;

  if (count('\t') > 0) {
    return '\t';
  }
  // Commas win a tie, because a lone semicolon in a header is likelier to be part of a column's
  // name than to be the one thing separating a table's only two columns.
  return count(';') > count(',') ? ';' : ',';
}

/**
 * A table back out as text, for an Editor who would rather work in the spreadsheet they already
 * have (story 114).
 *
 * **Written so that this archive can read it back**, which is the property the whole export
 * hangs on: the columns are the ones bulk paste recognises, so a sheet that goes out and comes
 * back is matched to what is already recorded rather than duplicated.
 *
 * The byte-order mark and the CRLF endings are Excel's, not RFC 4180's — without the mark Excel
 * reads UTF-8 as Latin-1 and turns every *Q.tà* into mojibake, and `readSheet` above strips it
 * again on the way in.
 */
export function writeSheet(columns: string[], rows: Record<string, string>[]): string {
  const line = (cells: string[]) => cells.map(quoteIfNeeded).join(',');

  return [
    `\uFEFF${line(columns)}`,
    ...rows.map((row) => line(columns.map((column) => row[column] ?? ''))),
  ].join('\r\n');
}

/**
 * A cell, quoted only where it has to be — so a sheet of numbers and short names stays a file a
 * person can read in a terminal. A leading or trailing space is quoted too: it survives the trip
 * out, and `readSheet` trims it back off on the way in.
 */
function quoteIfNeeded(cell: string): string {
  return /["\r\n,;\t]|^\s|\s$/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

interface Record_ {
  line: number;
  cells: string[];
}

function parseRecords(text: string, delimiter: string): Record_[] {
  const records: Record_[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let startedAt = 1;

  const endCell = () => {
    cells.push(cell);
    cell = '';
  };
  const endRecord = () => {
    endCell();
    records.push({ line: startedAt, cells });
    cells = [];
    startedAt = line;
  };

  for (let at = 0; at < text.length; at += 1) {
    const character = text[at];

    if (quoted) {
      if (character === '"') {
        if (text[at + 1] === '"') {
          cell += '"';
          at += 1;
        } else {
          quoted = false;
        }
      } else {
        if (character === '\n') {
          line += 1;
        }
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell === '') {
      quoted = true;
    } else if (character === delimiter) {
      endCell();
    } else if (character === '\r') {
      // Part of a CRLF; the newline that follows ends the record.
    } else if (character === '\n') {
      line += 1;
      endRecord();
    } else {
      cell += character;
    }
  }

  if (quoted) {
    throw new SheetError('A quoted cell was never closed. The export is truncated or corrupt.');
  }
  if (cell !== '' || cells.length > 0) {
    endRecord();
  }

  return records;
}
