/**
 * Which rule the database refused on.
 *
 * **The database is what enforces the archive's uniqueness rules**, rather than a read followed
 * by a write — two Editors filing at the same moment would both pass a check and both write. So
 * the way a service learns that a Tavola number is taken, or that a Catalog Number is already
 * recorded, is by being refused, and this is how it tells one refusal from another.
 *
 * Drizzle wraps what Postgres said, so the constraint name is one or two `cause` links down
 * rather than on the error in hand.
 */
export function violates(error: unknown, constraint: string): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ((current as { constraint?: unknown }).constraint === constraint) {
      return true;
    }
  }
  return false;
}
