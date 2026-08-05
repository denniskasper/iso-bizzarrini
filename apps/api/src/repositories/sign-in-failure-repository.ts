import { eq, lt, sql } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import { signInFailures, type SignInFailureRow } from '../db/schema.js';

/**
 * How sign-in has been going for one e-mail address.
 *
 * **Keyed by the address that was offered, not by an Account**, and that is the whole design: an
 * address nobody has heard of is counted exactly like one on the roster, so the lockout cannot
 * become the roster-membership oracle the sign-in form refuses to be (story 7).
 *
 * It is in the database rather than in a process because a lockout that a restart clears is a
 * lockout an attacker can clear, and because an Administrator will eventually want to see it.
 */
export interface SignInFailureRepository {
  find(email: string): Promise<SignInFailureRow | null>;
  /** Records one more failure and answers with the count as it now stands. */
  record(email: string, at: Date, window: { since: Date }): Promise<SignInFailureRow>;
  lockUntil(email: string, until: Date): Promise<void>;
  /** A sign-in that worked. Whatever was counted against this address stops being counted. */
  forget(email: string): Promise<void>;
  /** Drops rows nothing is still counting, so a stranger cannot grow this table for ever. */
  forgetOlderThan(instant: Date): Promise<void>;
}

export function createSignInFailureRepository(db: DbSession): SignInFailureRepository {
  return {
    async find(email) {
      const [row] = await db
        .select()
        .from(signInFailures)
        .where(eq(signInFailures.email, email))
        .limit(1);
      return row ?? null;
    },

    /**
     * One statement, so two attempts arriving together cannot both read "2" and both write "3".
     * The window is applied in the same breath: a failure whose predecessors are older than the
     * window starts a fresh count rather than adding to a stale one, which is what makes this a
     * rate limit rather than a permanent tally.
     */
    async record(email, at, window) {
      const [row] = await db
        .insert(signInFailures)
        .values({ email, failures: 1, firstFailureAt: at, lastFailureAt: at, lockedUntil: null })
        .onConflictDoUpdate({
          target: signInFailures.email,
          set: {
            failures: sql`case when ${signInFailures.lastFailureAt} < ${window.since} then 1 else ${signInFailures.failures} + 1 end`,
            firstFailureAt: sql`case when ${signInFailures.lastFailureAt} < ${window.since} then ${at} else ${signInFailures.firstFailureAt} end`,
            lastFailureAt: at,
          },
        })
        .returning();

      if (!row) {
        throw new Error('Recording a failed sign-in returned nothing.');
      }
      return row;
    },

    async lockUntil(email, until) {
      await db
        .update(signInFailures)
        .set({ lockedUntil: until })
        .where(eq(signInFailures.email, email));
    },

    async forget(email) {
      await db.delete(signInFailures).where(eq(signInFailures.email, email));
    },

    async forgetOlderThan(instant) {
      await db.delete(signInFailures).where(lt(signInFailures.lastFailureAt, instant));
    },
  };
}
