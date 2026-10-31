import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  ne,
  notExists,
  or,
  sql,
} from 'drizzle-orm';
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
import type { ProposalSpeaker, ProposalStatus, ProposalSummary } from '@ricambi/contracts';

/** A Proposal from the moment it is handed over: everything but a Draft. */
export type HandedOverStatus = Exclude<ProposalStatus, 'draft'>;

/** A Proposal as listed, with the author's first words read beside it. */
export interface ListedProposal {
  proposal: ProposalRow;
  opening: string | null;
}

/**
 * Proposals and their conversations (issue #152), **and the one rule about who is shown a
 * Draft**: its author, and nobody else; once handed over, everybody who may propose (#153). The
 * rule is in the statement rather than in a filter applied afterwards, as a waiting
 * Contribution's is, so no query on anybody else's behalf ever returns somebody's Draft.
 */
export interface ProposalRepository {
  add(proposal: NewProposalRow): Promise<ProposalRow>;
  /** One of this author's own Proposals, or null — whether it is somebody else's or none. */
  findOwn(id: string, authorId: string): Promise<ProposalRow | null>;
  /** One this person may read: their own, or one handed over. Null otherwise. */
  findVisible(id: string, accountId: string): Promise<ProposalRow | null>;
  /** This author's Drafts, the latest said-to first, each with their first words. */
  listDrafts(authorId: string): Promise<ListedProposal[]>;
  /**
   * Every handed-over Proposal, New first, then Taken up, Done and Declined, the latest handed
   * over first within each; only those standing at `status` where it is given.
   */
  listHandedOver(status: HandedOverStatus | null): Promise<ListedProposal[]>;
  /** What was handed over before, by kind, title and status, the oldest first. */
  listEarlier(): Promise<{ kind: ProposalRow['kind']; title: string; status: HandedOverStatus }[]>;
  /**
   * The finished Proposal, kept on the Draft, if it still is one. Null where it is not: a summary
   * written while the author hands over never replaces the one they handed over.
   */
  keepSummary(id: string, summary: ProposalSummary): Promise<ProposalRow | null>;
  /**
   * The Draft made New, if it still is a Draft with a summary and no screenshot waiting to be
   * sent (issue #154). Null where it is not, so two presses at once hand it over once.
   */
  handOver(id: string, at: Date): Promise<ProposalRow | null>;
  /** This author's Draft, gone with its conversation. Whether there was one to take away. */
  discard(id: string, authorId: string): Promise<boolean>;
  /**
   * The Proposal moved to `to`, if it still stands at one of `from`; null where it does not,
   * so two Administrators deciding at once cannot both move it.
   */
  move(
    id: string,
    from: readonly HandedOverStatus[],
    to: HandedOverStatus,
    declineReason: string | null,
  ): Promise<ProposalRow | null>;
  /** Oldest first. */
  listTurns(proposalId: string): Promise<ProposalTurnRow[]>;
  /**
   * The next turn, in the next place, and the Proposal marked as said-to then. A summary written
   * before it is set aside: it no longer says what the conversation has come to. One statement
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
  /**
   * The row taken away, or null where the Proposal had no such screenshot or is no longer a
   * Draft: one removed while its Proposal is handed over is never taken from what was handed over.
   */
  removeScreenshot(proposalId: string, screenshotId: string): Promise<ProposalScreenshotRow | null>;
  /**
   * A screenshot **if this reader may be shown it**: anybody's once its Proposal is handed over
   * and it was sent with a turn, and a Draft's only to its author. Null otherwise, as if there
   * were none.
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

    async findVisible(id, accountId) {
      const [row] = await db
        .select()
        .from(proposals)
        .where(
          and(
            eq(proposals.id, id),
            or(eq(proposals.authorId, accountId), ne(proposals.status, 'draft')),
          ),
        )
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

    async listHandedOver(status) {
      const standing = sql`case ${proposals.status}
        when 'new' then 0 when 'taken-up' then 1 when 'done' then 2 else 3 end`;
      return db
        .select({ proposal: proposals, opening })
        .from(proposals)
        .where(status === null ? ne(proposals.status, 'draft') : eq(proposals.status, status))
        .orderBy(standing, desc(proposals.handedOverAt), desc(proposals.id));
    },

    async listEarlier() {
      const rows = await db
        .select({ kind: proposals.kind, summary: proposals.summary, status: proposals.status })
        .from(proposals)
        .where(and(ne(proposals.status, 'draft'), isNotNull(proposals.summary)))
        .orderBy(asc(proposals.handedOverAt), asc(proposals.id));
      return rows.map(({ kind, summary, status }) => ({
        kind,
        title: summary?.title ?? '',
        status: status as HandedOverStatus,
      }));
    },

    async keepSummary(id, summary) {
      const [row] = await db
        .update(proposals)
        .set({ summary })
        .where(and(eq(proposals.id, id), eq(proposals.status, 'draft')))
        .returning();
      return row ?? null;
    },

    async handOver(id, at) {
      const [row] = await db
        .update(proposals)
        .set({ status: 'new', handedOverAt: at, updatedAt: at })
        .where(
          and(
            eq(proposals.id, id),
            eq(proposals.status, 'draft'),
            isNotNull(proposals.summary),
            notExists(
              db
                .select({ id: proposalScreenshots.id })
                .from(proposalScreenshots)
                .where(
                  and(eq(proposalScreenshots.proposalId, id), isNull(proposalScreenshots.turnId)),
                ),
            ),
          ),
        )
        .returning();
      return row ?? null;
    },

    async discard(id, authorId) {
      const gone = await db
        .delete(proposals)
        .where(
          and(
            eq(proposals.id, id),
            eq(proposals.authorId, authorId),
            eq(proposals.status, 'draft'),
          ),
        )
        .returning({ id: proposals.id });
      return gone.length > 0;
    },

    async move(id, from, to, declineReason) {
      const [row] = await db
        .update(proposals)
        .set({ status: to, declineReason })
        .where(and(eq(proposals.id, id), inArray(proposals.status, [...from])))
        .returning();
      return row ?? null;
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
      await db
        .update(proposals)
        .set({ updatedAt: at, summary: null })
        .where(eq(proposals.id, proposalId));
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
            exists(
              db
                .select({ id: proposals.id })
                .from(proposals)
                .where(and(eq(proposals.id, proposalId), eq(proposals.status, 'draft'))),
            ),
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
            or(
              and(ne(proposals.status, 'draft'), isNotNull(proposalScreenshots.turnId)),
              eq(proposals.authorId, readerId),
            ),
          ),
        )
        .limit(1);
      return row?.screenshot ?? null;
    },
  };
}
