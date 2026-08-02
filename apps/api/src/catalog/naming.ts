/**
 * Two small rules about catalog text that the archive applies rather than asks its Editors to
 * remember. They live here, together, because both exist for the same reason: the reference
 * sites this product replaces are inconsistent not through carelessness but because nothing in
 * them enforced anything.
 */

/**
 * What decides whether two typed Category names are the same Category. "Fuel System",
 * "fuel system" and "Fuel  system" all reduce to `fuel-system`, so an Editor typing a Category
 * they have used before gets that one rather than a near-duplicate.
 *
 * The Editor's own spelling is still what members read; this is only the key.
 */
export function categorySlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The leading digits of a number printed on a sheet, so a list of Tavole reads 2, 10, 12
 * rather than 10, 12, 2.
 *
 * Numbers in this archive are opaque strings — "12 bis", "210 S" — and stay that way. This is
 * a sort key and nothing else: it is never shown, never compared for equality, and a number
 * with no leading digits simply has none.
 */
export function numericPrefixOf(number: string): number | null {
  const digits = /^\s*(\d{1,9})/.exec(number);
  return digits ? Number(digits[1]) : null;
}
