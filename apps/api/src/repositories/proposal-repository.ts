import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import {
  proposals,
  proposalTurns,
  type NewProposalRow,
  type ProposalRow,
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
}

export function createProposalRepository(db: DbSession): ProposalRepository {
  /** What the author wrote first, read beside each Draft rather than once per row. */
  const opening = sql<string | null>`(
    select ${proposalTurns.text} from ${proposalTurns}
    where ${proposalTurns.proposalId} = ${proposals.id}
      and ${proposalTurns.speaker} = 'author'
    order by ${proposalTurns.sequence}
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
  };
}
