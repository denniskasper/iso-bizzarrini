import { z } from 'zod';

/**
 * Field rules more than one controller needs. They live here rather than in whichever
 * controller happened to want one first — a Zod helper exported from `catalog-controller` and
 * imported by `tavola-controller` makes the catalog controller a file that changes for reasons
 * that have nothing to do with the catalog.
 */

/**
 * Trimmed, with blank read as "not recorded" rather than as a value — which is what an Editor
 * leaving a field alone in a form means, and what an absent key means too.
 *
 * The trim is of the whitespace a form adds around a value, never of the value itself: a
 * Sezione printed as `SEZ.  26 / a` is stored with both of its spaces, because it is recorded
 * as the factory wrote it.
 */
export function blankToNull() {
  return z
    .string()
    .nullish()
    .transform((value) => {
      const trimmed = (value ?? '').trim();
      return trimmed === '' ? null : trimmed;
    });
}

/** A required piece of text an Editor typed, with the same trim and a name for the refusal. */
export function required(what: string) {
  return z.string().trim().min(1, what);
}
