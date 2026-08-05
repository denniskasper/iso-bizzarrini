/**
 * Rows that each name a Part, gathered under the Part they name.
 *
 * Every read in this directory that answers a question *about Parts* takes a set of Part ids
 * rather than one, and for one reason: a Position carrying two alternatives and three fixings is
 * five Parts, a search reports fifty, and a query each is how a screen becomes slow without
 * anybody deciding to make it slow. What comes back is therefore flat, and what reads it wants it
 * per Part.
 *
 * This is that turn, written once for every service that has to make it — so that "which rows
 * belong to this Part" cannot be answered two slightly different ways.
 */
export function byPart<Row extends { partId: string }>(rows: Row[]): Map<string, Row[]> {
  const gathered = new Map<string, Row[]>();
  for (const row of rows) {
    const found = gathered.get(row.partId);
    if (found) {
      found.push(row);
    } else {
      gathered.set(row.partId, [row]);
    }
  }
  return gathered;
}
