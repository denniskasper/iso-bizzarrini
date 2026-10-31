import { and, asc, desc, eq, isNull, ne, or, sql } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import {
  proposals,
  proposalScreenshots,
  proposalTurns,
  type NewProposalRow,
  type NewProposalScreenshotRow,
  type ProposalRow,
  type ProposalScreenshotRow,
  type ProposalTurnRow,
} from '../db/schema.js';
import type { ProposalSpeaker } from '@ricambi/contracts';

/**
 * Proposals and their conversations (issue #152), **and the one rule about who is shown a
 * Draft**: its author, and nobody else. The rule is in the statement rather than in a filter
 * applied afterwards, as a waiting Contribution's is, so no query on anybody else's behalf ever
 * returns somebody's Draft.
 */
export interface ProposalRepository {
  add(proposal: NewProposalRow): Promise<ProposalRow>;
  /** One of this author's own Proposals, or null — whether it is somebody else's or none. */
  findOwn(id: string, authorId: string): Promise<ProposalRow | null>;
  /** This author's Drafts, the latest said-to first, each with their first words. */
  listDrafts(authorId: string): Promise<{ proposal: ProposalRow; opening: string | null }[]>;
  /** Oldest first. */
  listTurns(proposalId: string): Promise<ProposalTurnRow[]>;
  /**
   * The next turn, in the next place, and the Proposal marked as said-to then. One statement
   * takes the place, so two turns written at once cannot both have it: the second is refused by
   * the constraint rather than written over the first.
   */
  addTurn(turn: {
    proposalId: string;
    speaker: ProposalSpeaker;
    text: string;
    at: Date;
  }): Promise<ProposalTurnRow>;

  /**
   * A screenshot onto a Draft (issue #154), waiting to be sent with a turn, in the next place.
   * One statement takes the place, as a turn's does.
   */
  addScreenshot(
    screenshot: Omit<NewProposalScreenshotRow, 'sequence'>,
  ): Promise<ProposalScreenshotRow>;
  /** Every screenshot of a Proposal, sent or not, in the order they were added. */
  listScreenshots(proposalId: string): Promise<ProposalScreenshotRow[]>;
  /** Waiting screenshots of a Proposal sent with one of its turns, each with its note. */
  sendScreenshots(
    proposalId: string,
    turnId: string,
    screenshots: { id: string; note: string | null }[],
  ): Promise<void>;
  /** The row taken away, or null where the Proposal had no such screenshot. */
  removeScreenshot(proposalId: string, screenshotId: string): Promise<ProposalScreenshotRow | null>;
  /**
   * A screenshot **if this reader may be shown it**: anybody's once its Proposal is handed over,
   * and a Draft's only to its author. Null otherwise, as if there were none.
   */
  findScreenshotReadableBy(
    screenshotId: string,
    readerId: string,
  ): Promise<ProposalScreenshotRow | null>;
}

export function createProposalRepository(db: DbSession): ProposalRepository {
  /**
   * What the author wrote first, read beside each Draft rather than once per row. Spelled out
   * with qualified names: in a select from one table, Drizzle writes its columns unqualified, so
   * `proposals.id` inside this subquery would be read as the turn's own `id` and match nothing.
   */
  const turn = sql.identifier('opening_turn');
  const column = (name: string) => sql`${turn}.${sql.identifier(name)}`;
  const opening = sql<string | null>`(
    select ${column(proposalTurns.text.name)} from ${proposalTurns} as ${turn}
    where ${column(proposalTurns.proposalId.name)} = ${proposals}.${sql.identifier(proposals.id.name)}
      and ${column(proposalTurns.speaker.name)} = 'author'
    order by ${column(proposalTurns.sequence.name)}
    limit 1
  )`;

  return {
    async add(proposal) {
      const [row] = await db.insert(proposals).values(proposal).returning();
      if (!row) {
        throw new Error('Inserting a Proposal returned nothing.');
      }
      return row;
    },

    async findOwn(id, authorId) {
      const [row] = await db
        .select()
        .from(proposals)
        .where(and(eq(proposals.id, id), eq(proposals.authorId, authorId)))
        .limit(1);
      return row ?? null;
    },

    async listDrafts(authorId) {
      return db
        .select({ proposal: proposals, opening })
        .from(proposals)
        .where(and(eq(proposals.authorId, authorId), eq(proposals.status, 'draft')))
        .orderBy(desc(proposals.updatedAt), desc(proposals.startedAt));
    },

    async listTurns(proposalId) {
      return db
        .select()
        .from(proposalTurns)
        .where(eq(proposalTurns.proposalId, proposalId))
        .orderBy(asc(proposalTurns.sequence));
    },

    async addTurn({ proposalId, speaker, text, at }) {
      const next = sql<number>`(
        select coalesce(max(${proposalTurns.sequence}) + 1, 0) from ${proposalTurns}
        where ${proposalTurns.proposalId} = ${proposalId}
      )`;
      const [row] = await db
        .insert(proposalTurns)
        .values({ proposalId, sequence: next, speaker, text, at })
        .returning();
      if (!row) {
        throw new Error('Inserting a turn returned nothing.');
      }
      await db.update(proposals).set({ updatedAt: at }).where(eq(proposals.id, proposalId));
      return row;
    },

    async addScreenshot(screenshot) {
      const next = sql<number>`(
        select coalesce(max(${proposalScreenshots.sequence}) + 1, 0) from ${proposalScreenshots}
        where ${proposalScreenshots.proposalId} = ${screenshot.proposalId}
      )`;
      const [row] = await db
        .insert(proposalScreenshots)
        .values({ ...screenshot, sequence: next })
        .returning();
      if (!row) {
        throw new Error('Inserting a screenshot returned nothing.');
      }
      return row;
    },

    async listScreenshots(proposalId) {
      return db
        .select()
        .from(proposalScreenshots)
        .where(eq(proposalScreenshots.proposalId, proposalId))
        .orderBy(asc(proposalScreenshots.sequence));
    },

    async sendScreenshots(proposalId, turnId, screenshots) {
      for (const { id, note } of screenshots) {
        await db
          .update(proposalScreenshots)
          .set({ turnId, note })
          .where(
            and(
              eq(proposalScreenshots.id, id),
              eq(proposalScreenshots.proposalId, proposalId),
              isNull(proposalScreenshots.turnId),
            ),
          );
      }
    },

    async removeScreenshot(proposalId, screenshotId) {
      const [row] = await db
        .delete(proposalScreenshots)
        .where(
          and(
            eq(proposalScreenshots.id, screenshotId),
            eq(proposalScreenshots.proposalId, proposalId),
          ),
        )
        .returning();
      return row ?? null;
    },

    async findScreenshotReadableBy(screenshotId, readerId) {
      const [row] = await db
        .select({ screenshot: proposalScreenshots })
        .from(proposalScreenshots)
        .innerJoin(proposals, eq(proposals.id, proposalScreenshots.proposalId))
        .where(
          and(
            eq(proposalScreenshots.id, screenshotId),
            or(ne(proposals.status, 'draft'), eq(proposals.authorId, readerId)),
          ),
        )
        .limit(1);
      return row?.screenshot ?? null;
    },
  };
}
