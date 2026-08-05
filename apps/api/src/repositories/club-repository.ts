import { eq } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import { club, SOLE_CLUB_ROW, type ClubRow, type NewClubRow } from '../db/schema.js';

/**
 * The Club. One row, and the only repository whose every method already knows which row it wants.
 *
 * `read` answers null rather than creating one. What an unwritten Club looks like is a question
 * about the association — a fee of nothing, in euros, with no bank details yet — and that belongs
 * with the service that knows the answer, not in a migration that would have to be edited to
 * change it.
 */
export interface ClubRepository {
  read(): Promise<ClubRow | null>;
  /** Writes the row, creating it if this is the first time anybody has said what the Club is. */
  save(fields: Omit<NewClubRow, 'id'>): Promise<ClubRow>;
}

export function createClubRepository(db: DbSession): ClubRepository {
  return {
    async read() {
      const [row] = await db.select().from(club).where(eq(club.id, SOLE_CLUB_ROW)).limit(1);
      return row ?? null;
    },

    async save(fields) {
      const [row] = await db
        .insert(club)
        .values({ ...fields, id: SOLE_CLUB_ROW })
        .onConflictDoUpdate({ target: club.id, set: fields })
        .returning();

      if (!row) {
        throw new Error('Saving the Club returned nothing.');
      }
      return row;
    },
  };
}
