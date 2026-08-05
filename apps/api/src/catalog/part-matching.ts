import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { catalogNumberKey } from './part-identity.js';

/**
 * **What a member's query matches, said in SQL — one file, so there is one answer.**
 *
 * `part-identity.ts` next door says what makes two rows the same Part; this says what makes a
 * typed query name one. The two overlap in `catalogNumberKey`, deliberately: the rule that
 * `260 03 150` and `26003150` are the same number is the same rule whether it is deciding that a
 * paste has met a Part already or that a member has found one.
 *
 * There are two kinds of thing to match and they are matched differently on purpose.
 *
 * **Numbers** — Catalog Number, Disegno Origine, an Equivalent's reference — ignore the spacing
 * on both sides. The catalog prints spaces where the factory's typesetter put them and the
 * stamping on the part has none, and a member holding the bracket types what is on the bracket.
 *
 * **Names** are matched as they are written, case ignored and spacing kept, because a name is
 * prose and the spaces in it are between words rather than inside a number.
 *
 * Both match from the **beginning** and never from the middle (spec: exact and prefix matching).
 * Matching from the middle is a free-text search, which is what "Postgres only, no relevance
 * ranking" rules out — and it is what would drag Notes and Catalog Notes in after it.
 */

/**
 * A stored number with the catalog's own spacing and case taken out of it — `catalogNumberKey`
 * said about a column instead of about a string. One rule, two languages, and they have to stay
 * the same rule.
 *
 * It is deliberately **not** indexed. This archive holds a few thousand Parts; an expression
 * index on each of the three numbers would be three indexes maintained on every write to buy a
 * scan of a table that fits in memory.
 */
export function squashedNumber(column: SQLWrapper): SQL {
  return sql`lower(regexp_replace(coalesce(${column}, ''), '[[:space:]]', '', 'g'))`;
}

/**
 * What was typed, as a prefix pattern — with `%` and `_` reduced to the characters they are.
 * Somebody looking for a part whose name has a percent sign in it is looking for that sign, and
 * a lone `%` is a member typing a character rather than asking for the whole archive.
 */
function asPrefixPattern(query: string): string {
  return `${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/**
 * A number the query names, whatever spacing either side was written with, from its beginning.
 *
 * A blank key would match every row, which is why nothing may reach here with one: the controller
 * refuses a query with nothing in it, so `query` always has a character that is not a space.
 */
export function numberBeginsWith(column: SQLWrapper, query: string): SQL {
  return sql`${squashedNumber(column)} like ${asPrefixPattern(catalogNumberKey(query))}`;
}

/** The same number and no more of it — what "exact" means once the spacing is gone. */
export function numberIsExactly(column: SQLWrapper, query: string): SQL {
  return sql`${squashedNumber(column)} = ${catalogNumberKey(query)}`;
}

/** A name from its beginning, in whichever case the member happened to type it. */
export function nameBeginsWith(column: SQLWrapper, query: string): SQL {
  return sql`${column} ilike ${asPrefixPattern(query)}`;
}
