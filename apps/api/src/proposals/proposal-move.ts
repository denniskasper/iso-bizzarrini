import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProposalSummary } from '@ricambi/contracts';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import {
  accounts,
  PROPOSAL_KINDS,
  PROPOSAL_SPEAKERS,
  PROPOSAL_STATUSES,
  proposals,
  proposalScreenshots,
  proposalTurns,
} from '../db/schema.js';
import {
  createFileStore,
  proposalScreenshotKeyPrefix,
  type FileStore,
} from '../storage/file-store.js';

/**
 * **Proposals moved from one practice system to another** (issue #157): written out with their
 * turns and screenshots into a directory, and read back in on the other side. It is how nothing
 * is lost when Integration moves from the developer's preview to the Club's host.
 *
 * Everything keeps its id, so a Proposal is the same Proposal on both systems and its screenshots'
 * files keep their keys. Its author is carried by address, and found again on the other side only
 * if an Account there has it; otherwise the Proposal stands without one, as it does after the
 * roster is re-seeded.
 */

/** What the directory holds besides the screenshots' files. */
const MANIFEST = 'proposals.json';
/** Where in the directory the screenshots' files are, under the keys they had in the store. */
const FILES = 'files';
const FORMAT = 'ricambi-proposals/1';

const instant = z.iso.datetime({ offset: true });

const exportedScreenshot = z.object({
  id: z.uuid(),
  turnId: z.uuid().nullable(),
  sequence: z.number().int().min(0),
  note: z.string().nullable(),
  sourceFormat: z.string(),
  sourceByteSize: z.number().int(),
  sourceWidth: z.number().int(),
  sourceHeight: z.number().int(),
  displayFormat: z.string(),
  displayByteSize: z.number().int(),
  displayWidth: z.number().int(),
  displayHeight: z.number().int(),
  previewByteSize: z.number().int(),
  originalKey: z.string(),
  displayKey: z.string(),
  previewKey: z.string(),
  uploadedAt: instant,
});

const exportedProposal = z.object({
  id: z.uuid(),
  /** The author's address, or null where their Account was already gone. */
  authorEmail: z.string().nullable(),
  kind: z.enum(PROPOSAL_KINDS),
  status: z.enum(PROPOSAL_STATUSES),
  pageAddress: z.string(),
  version: z.string(),
  modelId: z.uuid().nullable(),
  modelName: z.string().nullable(),
  tavolaId: z.uuid().nullable(),
  tavolaNumber: z.string().nullable(),
  tavolaName: z.string().nullable(),
  summary: z.custom<ProposalSummary>((value) => typeof value === 'object').nullable(),
  declineReason: z.string().nullable(),
  startedAt: instant,
  updatedAt: instant,
  handedOverAt: instant.nullable(),
  turns: z.array(
    z.object({
      id: z.uuid(),
      sequence: z.number().int().min(0),
      speaker: z.enum(PROPOSAL_SPEAKERS),
      text: z.string(),
      at: instant,
    }),
  ),
  screenshots: z.array(exportedScreenshot),
});

const manifest = z.object({
  format: z.literal(FORMAT),
  proposals: z.array(exportedProposal),
});

type ExportedProposal = z.infer<typeof exportedProposal>;

export interface MovedProposals {
  proposals: number;
  turns: number;
  screenshots: number;
}

/** Refused rather than done: nothing was written. */
export class ProposalMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProposalMoveError';
  }
}

/**
 * Every Proposal, Drafts too, written into `directory` with its turns and its screenshots' files.
 * Refuses a directory that already holds an export, rather than writing over it.
 */
export async function exportProposals(
  dependencies: { db: Db; fileStore: FileStore },
  directory: string,
): Promise<MovedProposals> {
  const { db, fileStore } = dependencies;

  if (await exists(join(directory, MANIFEST))) {
    throw new ProposalMoveError(
      `${directory} already holds exported Proposals. Choose an empty directory.`,
    );
  }

  const rows = await db
    .select({ proposal: proposals, authorEmail: accounts.email })
    .from(proposals)
    .leftJoin(accounts, eq(accounts.id, proposals.authorId))
    .orderBy(asc(proposals.startedAt), asc(proposals.id));
  const ids = rows.map((row) => row.proposal.id);
  const turns =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(proposalTurns)
          .where(inArray(proposalTurns.proposalId, ids))
          .orderBy(asc(proposalTurns.sequence));
  const screenshots =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(proposalScreenshots)
          .where(inArray(proposalScreenshots.proposalId, ids))
          .orderBy(asc(proposalScreenshots.sequence));

  const target = createFileStore(join(directory, FILES));
  for (const screenshot of screenshots) {
    for (const key of [screenshot.originalKey, screenshot.displayKey, screenshot.previewKey]) {
      const file = await fileStore.open(key);
      if (!file) {
        throw new ProposalMoveError(
          `The screenshot ${screenshot.id} has no file at ${key}, so it cannot be moved.`,
        );
      }
      await target.writeFrom(key, file.stream());
    }
  }

  const exported: ExportedProposal[] = rows.map(({ proposal, authorEmail }) => ({
    id: proposal.id,
    authorEmail,
    kind: proposal.kind,
    status: proposal.status,
    pageAddress: proposal.pageAddress,
    version: proposal.version,
    modelId: proposal.modelId,
    modelName: proposal.modelName,
    tavolaId: proposal.tavolaId,
    tavolaNumber: proposal.tavolaNumber,
    tavolaName: proposal.tavolaName,
    summary: proposal.summary,
    declineReason: proposal.declineReason,
    startedAt: proposal.startedAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
    handedOverAt: proposal.handedOverAt?.toISOString() ?? null,
    turns: turns
      .filter((turn) => turn.proposalId === proposal.id)
      .map(({ id, sequence, speaker, text, at }) => ({
        id,
        sequence,
        speaker,
        text,
        at: at.toISOString(),
      })),
    screenshots: screenshots
      .filter((screenshot) => screenshot.proposalId === proposal.id)
      .map(({ proposalId: _proposalId, uploadedAt, ...screenshot }) => ({
        ...screenshot,
        uploadedAt: uploadedAt.toISOString(),
      })),
  }));

  // Written last, so a directory with a manifest in it is a whole export.
  await writeFile(
    join(directory, MANIFEST),
    JSON.stringify({ format: FORMAT, proposals: exported }, null, 2),
  );

  return {
    proposals: exported.length,
    turns: turns.length,
    screenshots: screenshots.length,
  };
}

/**
 * The Proposals exported into `directory`, read into a system that has none. **Refuses one that
 * already has Proposals**, writing nothing: an import never stands in for, or beside, what is
 * already there.
 */
export async function importProposals(
  dependencies: { db: Db; fileStore: FileStore },
  directory: string,
): Promise<MovedProposals> {
  const { db, fileStore } = dependencies;

  const read = manifest.safeParse(JSON.parse(await readManifest(directory)));
  if (!read.success) {
    throw new ProposalMoveError(
      `${join(directory, MANIFEST)} is not an export of Proposals: ${read.error.message}`,
    );
  }
  const exported = read.data.proposals;

  for (const screenshot of exported.flatMap((proposal) => proposal.screenshots)) {
    const prefix = proposalScreenshotKeyPrefix(screenshot.id);
    for (const key of [screenshot.originalKey, screenshot.displayKey, screenshot.previewKey]) {
      if (!key.startsWith(`${prefix}/`)) {
        throw new ProposalMoveError(
          `The screenshot ${screenshot.id} names a file outside its own.`,
        );
      }
    }
  }

  if ((await db.$count(proposals)) > 0) {
    throw new ProposalMoveError(
      'This system already has Proposals, and an import never writes over them. ' +
        'Import into a system with none.',
    );
  }

  const emails = [
    ...new Set(
      exported.flatMap((proposal) => (proposal.authorEmail ? [proposal.authorEmail] : [])),
    ),
  ];
  const found =
    emails.length === 0
      ? []
      : await db
          .select({ id: accounts.id, email: accounts.email })
          .from(accounts)
          .where(inArray(accounts.email, emails));
  const authorOf = new Map(found.map((account) => [account.email, account.id]));

  const source = createFileStore(join(directory, FILES));
  const written: string[] = [];
  try {
    for (const screenshot of exported.flatMap((proposal) => proposal.screenshots)) {
      written.push(screenshot.id);
      for (const key of [screenshot.originalKey, screenshot.displayKey, screenshot.previewKey]) {
        const file = await source.open(key);
        if (!file) {
          throw new ProposalMoveError(
            `The export has no file at ${key} for the screenshot ${screenshot.id}.`,
          );
        }
        await fileStore.writeFrom(key, file.stream());
      }
    }

    await db.transaction(async (tx) => {
      for (const proposal of exported) {
        await tx.insert(proposals).values({
          id: proposal.id,
          authorId:
            proposal.authorEmail === null ? null : (authorOf.get(proposal.authorEmail) ?? null),
          kind: proposal.kind,
          status: proposal.status,
          pageAddress: proposal.pageAddress,
          version: proposal.version,
          modelId: proposal.modelId,
          modelName: proposal.modelName,
          tavolaId: proposal.tavolaId,
          tavolaNumber: proposal.tavolaNumber,
          tavolaName: proposal.tavolaName,
          summary: proposal.summary,
          declineReason: proposal.declineReason,
          startedAt: new Date(proposal.startedAt),
          updatedAt: new Date(proposal.updatedAt),
          handedOverAt: proposal.handedOverAt === null ? null : new Date(proposal.handedOverAt),
        });
        if (proposal.turns.length > 0) {
          await tx.insert(proposalTurns).values(
            proposal.turns.map((turn) => ({
              ...turn,
              proposalId: proposal.id,
              at: new Date(turn.at),
            })),
          );
        }
        if (proposal.screenshots.length > 0) {
          await tx.insert(proposalScreenshots).values(
            proposal.screenshots.map((screenshot) => ({
              ...screenshot,
              proposalId: proposal.id,
              uploadedAt: new Date(screenshot.uploadedAt),
            })),
          );
        }
      }
    });
  } catch (error) {
    for (const screenshotId of written) {
      await fileStore.remove(proposalScreenshotKeyPrefix(screenshotId));
    }
    throw error;
  }

  return {
    proposals: exported.length,
    turns: exported.reduce((sum, proposal) => sum + proposal.turns.length, 0),
    screenshots: written.length,
  };
}

async function readManifest(directory: string): Promise<string> {
  try {
    return await readFile(join(directory, MANIFEST), 'utf8');
  } catch {
    throw new ProposalMoveError(`${directory} holds no exported Proposals.`);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
