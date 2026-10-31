import { randomUUID } from 'node:crypto';
import type {
  Proposal,
  ProposalContext,
  ProposalKind,
  ProposalScreenshot,
  ProposalSummary,
  ProposalTurn,
} from '@ricambi/contracts';
import type { ProposalRow, ProposalScreenshotRow, ProposalTurnRow } from '../db/schema.js';
import { ConflictError, NotFoundError, ValidationError } from '../http/errors.js';
import type { StoredImage } from '../http/served-image.js';
import { proposalScreenshotImageUrl, type ImageVariant } from '../images/image-addresses.js';
import { prepareScreenshot } from '../images/screenshot-ingest.js';
import type { Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import type {
  ConversationMethod,
  ConversationScreenshot,
} from '../proposals/conversation-method.js';
import type { ModelRepository } from '../repositories/model-repository.js';
import type { ProposalRepository } from '../repositories/proposal-repository.js';
import type { TavolaRepository } from '../repositories/tavola-repository.js';
import { proposalScreenshotKeyPrefix, type FileStore } from '../storage/file-store.js';
import { discardImageFiles, openStoredImage, storeImageFiles } from '../storage/stored-images.js';

/** Who is proposing, as far as a Proposal needs to know. */
export interface Proposer {
  accountId: string;
  /** Whether they are shown Unchecked Tavole (ADR 0017), so a Draft names none they are not. */
  seesUnchecked: boolean;
}

export interface StartProposal {
  kind: ProposalKind;
  pageAddress: string;
  modelId: string | null;
  tavolaId: string | null;
}

/** A waiting screenshot named by the turn it is sent with, and what the author says about it. */
export interface SentScreenshot {
  id: string;
  note: string | null;
}

/**
 * **Proposing a Fix or an Idea** (issue #152): a Draft started with what was on screen, and a
 * conversation about it, a turn at a time. Every read here is of the proposer's own Proposals;
 * somebody else's Draft is answered as one that does not exist.
 */
export interface ProposalService {
  start(proposer: Proposer, request: StartProposal): Promise<Proposal>;
  listDrafts(proposer: Proposer): Promise<ProposalSummary[]>;
  read(proposer: Proposer, proposalId: string): Promise<Proposal>;
  /**
   * The author's turn kept, then answered: each piece of the answer is handed to `heard` as it is
   * written, and the answer is kept once it is whole. Refuses before anything is kept or written
   * where the Proposal is not the author's Draft.
   */
  converse(
    proposer: Proposer,
    proposalId: string,
    turn: { text: string; screenshots: SentScreenshot[] },
    heard: (piece: string) => void,
  ): Promise<ProposalTurn[]>;
  /**
   * A screenshot shown on the author's Draft (issue #154), waiting there until a turn sends it.
   * What it is is decided by reading it.
   */
  show(proposer: Proposer, proposalId: string, upload: Buffer): Promise<ProposalScreenshot>;
  /** A screenshot taken off the author's Draft, sent or not, and its files with it. */
  removeScreenshot(proposer: Proposer, proposalId: string, screenshotId: string): Promise<Proposal>;
  /** Null where there is none this proposer may be shown, so the route answers 404. */
  openScreenshot(
    proposer: Proposer,
    screenshotId: string,
    variant: ImageVariant,
  ): Promise<StoredImage | null>;
}

export function createProposalService(dependencies: {
  clock: Clock;
  fileStore: FileStore;
  logger: Logger;
  /** Null where Proposals are closed here, which the gate has already refused. */
  conversation: ConversationMethod | null;
  /** The Version this server is, written onto every Draft started on it. */
  version: string;
  proposalRepository: ProposalRepository;
  modelRepository: ModelRepository;
  tavolaRepository: TavolaRepository;
}): ProposalService {
  const {
    clock,
    fileStore,
    logger,
    conversation,
    version,
    proposalRepository,
    modelRepository,
    tavolaRepository,
  } = dependencies;

  async function own(proposer: Proposer, proposalId: string): Promise<ProposalRow> {
    const proposal = await proposalRepository.findOwn(proposalId, proposer.accountId);
    if (proposal === null) {
      throw new NotFoundError('There is no such Proposal of yours.');
    }
    return proposal;
  }

  async function draft(proposer: Proposer, proposalId: string): Promise<ProposalRow> {
    const proposal = await own(proposer, proposalId);
    if (proposal.status !== 'draft') {
      throw new ConflictError('This Proposal has been handed over, and its conversation is over.');
    }
    return proposal;
  }

  async function whole(proposal: ProposalRow): Promise<Proposal> {
    const [turns, screenshots] = await Promise.all([
      proposalRepository.listTurns(proposal.id),
      proposalRepository.listScreenshots(proposal.id),
    ]);
    const opening = turns.find((turn) => turn.speaker === 'author')?.text ?? null;
    return {
      ...summaryOf(proposal, opening),
      turns: turns.map((turn) => turnOf(turn, screenshots)),
      unsent: screenshots.filter((shot) => shot.turnId === null).map(screenshotOf),
    };
  }

  /** The picture as the conversation is shown it: the display image, read whole. */
  async function picture(screenshot: ProposalScreenshotRow): Promise<ConversationScreenshot> {
    const file = await fileStore.open(screenshot.displayKey);
    if (file === null) {
      throw new Error(`A screenshot's file is missing from the store: ${screenshot.id}`);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of file.stream()) {
      chunks.push(chunk as Buffer);
    }
    return { note: screenshot.note, mediaType: 'image/webp', data: Buffer.concat(chunks) };
  }

  /**
   * The Model and Tavola looked up rather than taken on trust, and written down as they are now.
   * A Tavola names its Model (ADR 0002), so where both are given the Tavola's is the one kept.
   */
  async function onScreen(
    proposer: Proposer,
    request: StartProposal,
  ): Promise<Pick<ProposalContext, 'model' | 'tavola'>> {
    if (request.tavolaId !== null) {
      const tavola = await tavolaRepository.findById(request.tavolaId);
      if (tavola !== null && (tavola.state === 'published' || proposer.seesUnchecked)) {
        return {
          model: { id: tavola.model.id, name: modelName(tavola.model) },
          tavola: { id: tavola.id, number: tavola.number, name: tavola.nameEn },
        };
      }
    }
    if (request.modelId !== null) {
      const model = await modelRepository.findById(request.modelId);
      if (model !== null) {
        return { model: { id: model.id, name: modelName(model) }, tavola: null };
      }
    }
    return { model: null, tavola: null };
  }

  return {
    async start(proposer, request) {
      const { model, tavola } = await onScreen(proposer, request);
      const now = clock.now();
      const proposal = await proposalRepository.add({
        authorId: proposer.accountId,
        kind: request.kind,
        pageAddress: request.pageAddress,
        version,
        modelId: model?.id ?? null,
        modelName: model?.name ?? null,
        tavolaId: tavola?.id ?? null,
        tavolaNumber: tavola?.number ?? null,
        tavolaName: tavola?.name ?? null,
        startedAt: now,
        updatedAt: now,
      });
      return whole(proposal);
    },

    async listDrafts(proposer) {
      const drafts = await proposalRepository.listDrafts(proposer.accountId);
      return drafts.map(({ proposal, opening }) => summaryOf(proposal, opening));
    },

    async read(proposer, proposalId) {
      return whole(await own(proposer, proposalId));
    },

    async converse(proposer, proposalId, { text, screenshots: sent }, heard) {
      const proposal = await draft(proposer, proposalId);
      if (conversation === null) {
        throw new ConflictError('There is no conversation to be had here.');
      }
      const waiting = new Set(
        (await proposalRepository.listScreenshots(proposalId))
          .filter((shot) => shot.turnId === null)
          .map((shot) => shot.id),
      );
      if (sent.some((shot) => !waiting.delete(shot.id))) {
        throw new ValidationError('That screenshot is not one waiting to be sent on this Draft.');
      }

      const asked = await proposalRepository.addTurn({
        proposalId,
        speaker: 'author',
        text,
        at: clock.now(),
      });
      await proposalRepository.sendScreenshots(proposalId, asked.id, sent);
      const [turns, screenshots] = await Promise.all([
        proposalRepository.listTurns(proposalId),
        proposalRepository.listScreenshots(proposalId),
      ]);

      let answer = '';
      for await (const piece of conversation.answer({
        kind: proposal.kind,
        context: contextOf(proposal),
        turns: await Promise.all(
          turns.map(async (turn) => ({
            speaker: turn.speaker,
            text: turn.text,
            screenshots: await Promise.all(
              screenshots.filter((shot) => shot.turnId === turn.id).map(picture),
            ),
          })),
        ),
      })) {
        answer += piece;
        heard(piece);
      }

      const answered = await proposalRepository.addTurn({
        proposalId,
        speaker: 'conversation',
        text: answer,
        at: clock.now(),
      });
      return [turnOf(asked, screenshots), turnOf(answered, [])];
    },

    async show(proposer, proposalId, upload) {
      await draft(proposer, proposalId);
      const prepared = await prepareScreenshot(upload);

      // Minted here, because the files are written before the row is, and under it.
      const id = randomUUID();
      const prefix = proposalScreenshotKeyPrefix(id);
      const stored = await storeImageFiles(fileStore, prefix, upload, prepared);
      try {
        const row = await proposalRepository.addScreenshot({
          id,
          proposalId,
          ...stored,
          uploadedAt: clock.now(),
        });
        return screenshotOf(row);
      } catch (error) {
        await discardImageFiles(fileStore, prefix);
        throw error;
      }
    },

    async removeScreenshot(proposer, proposalId, screenshotId) {
      const proposal = await draft(proposer, proposalId);
      const removed = await proposalRepository.removeScreenshot(proposalId, screenshotId);
      if (removed === null) {
        throw new NotFoundError('There is no such screenshot on this Draft.');
      }
      await discardImageFiles(fileStore, proposalScreenshotKeyPrefix(removed.id));
      return whole(proposal);
    },

    async openScreenshot(proposer, screenshotId, variant) {
      const screenshot = await proposalRepository.findScreenshotReadableBy(
        screenshotId,
        proposer.accountId,
      );
      return screenshot ? openStoredImage({ fileStore, logger }, screenshot, variant) : null;
    },
  };
}

function modelName(model: { brand: string; name: string; series: string | null }): string {
  return [model.brand, model.name, model.series].filter((part) => part !== null).join(' ');
}

function contextOf(proposal: ProposalRow): ProposalContext {
  return {
    pageAddress: proposal.pageAddress,
    version: proposal.version,
    model:
      proposal.modelId === null ? null : { id: proposal.modelId, name: proposal.modelName ?? '' },
    tavola:
      proposal.tavolaId === null
        ? null
        : {
            id: proposal.tavolaId,
            number: proposal.tavolaNumber ?? '',
            name: proposal.tavolaName ?? '',
          },
  };
}

function summaryOf(proposal: ProposalRow, opening: string | null): ProposalSummary {
  return {
    id: proposal.id,
    kind: proposal.kind,
    status: proposal.status,
    context: contextOf(proposal),
    opening,
    startedAt: proposal.startedAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
  };
}

function turnOf(turn: ProposalTurnRow, screenshots: ProposalScreenshotRow[]): ProposalTurn {
  return {
    sequence: turn.sequence,
    speaker: turn.speaker,
    text: turn.text,
    at: turn.at.toISOString(),
    screenshots: screenshots.filter((shot) => shot.turnId === turn.id).map(screenshotOf),
  };
}

function screenshotOf(row: ProposalScreenshotRow): ProposalScreenshot {
  return {
    id: row.id,
    note: row.note,
    width: row.displayWidth,
    height: row.displayHeight,
    displayUrl: proposalScreenshotImageUrl(row.id, 'display'),
    previewUrl: proposalScreenshotImageUrl(row.id, 'preview'),
  };
}
