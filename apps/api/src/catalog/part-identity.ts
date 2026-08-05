/**
 * **What decides that two rows describe one Part** — ADR 0001, written as code rather than as
 * prose each caller reimplements.
 *
 * A Part is a thing in its own right and the same Part appears on many drawings, so everything
 * that reads Parts *in bulk* — the archive migration, an Editor's bulk paste, the lookup — has to
 * answer "have I met this one already". Three places asking that question three ways is exactly
 * the inconsistency this product exists to remove, so the two rules live here and nowhere else.
 */

/**
 * A Catalog Number with the catalog's own spacing and case taken out of it.
 *
 * The catalog prints `260 03 150`; the bracket in somebody's hand is stamped `26003150`. Both are
 * the same number, and an Editor should not have to guess which the archive was given. The
 * database's unique constraint cannot see this — the two strings differ — so anything comparing
 * numbers before it writes has to compare them through here.
 *
 * It is a **key and never a value**: the number an Editor typed is stored exactly as they typed
 * it, spacing and all, because it is an identifier read character by character off a printed page.
 */
export function catalogNumberKey(catalogNumber: string): string {
  return catalogNumber.replace(/\s+/g, '').toLowerCase();
}

/**
 * What identifies a Part that has **no** Catalog Number: where it is listed on one sheet, and
 * what it is called.
 *
 * A great many Parts have no number and that is ordinary rather than incomplete (ADR 0001), so
 * the identity rule above cannot reach them — and something has to, or every spreadsheet pasted
 * back would duplicate half the sheet it came from.
 *
 * **Within one Tavola only.** The same washer named at two numbers on one drawing is two rows of
 * a catalog page and the archive has nothing to say about whether it is one component; the number
 * is what would have said so, and there is none. So this deliberately does not reach across sheets.
 *
 * `archive-writer.findPartListedAs` is the same key expressed as a `WHERE` clause, for the loader,
 * which asks it of one row at a time against the whole archive rather than of two hundred rows
 * against one sheet already in hand. The two must agree; this is the one that says what they agree
 * on.
 */
export function unnumberedPartKey(where: {
  positionNumber: string | null;
  nameEn: string | null;
  nameIt: string | null;
}): string {
  return JSON.stringify([where.positionNumber, where.nameEn, where.nameIt]);
}
