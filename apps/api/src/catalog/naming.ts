import type { Uncategorised } from '@ricambi/contracts';

/**
 * Two small rules about catalog text that the archive applies rather than asks its Editors to
 * remember. They live here, together, because both exist for the same reason: the reference
 * sites this product replaces are inconsistent not through carelessness but because nothing in
 * them enforced anything.
 */

/**
 * What decides whether two Category names are the same Category. "Fuel System", "fuel system"
 * and "Fuel  system" all reduce to `fuel-system`, so a name already on the list is found
 * however it was capitalised, and cannot be added a second time under another spelling.
 *
 * The spelling on the list is still what members read; this is the key, and the word an address
 * names a Category by.
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
 * What a filter and an address call a Tavola with no Category. No Category may reduce to it, or
 * "everything filed under Uncategorised" and "everything not filed" would be one address.
 */
export const UNCATEGORISED: Uncategorised = 'uncategorised';

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
