import { randomUUID } from 'node:crypto';
import type {
  Proposal,
  ProposalContext,
  ProposalKind,
  ProposalListing,
  ProposalScreenshot,
  ProposalStatusRequest,
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
  Conversation,
  ConversationMethod,
  ConversationScreenshot,
} from '../proposals/conversation-method.js';
import type { ModelRepository } from '../repositories/model-repository.js';
import type {
  HandedOverStatus,
  ListedProposal,
  ProposalRepository,
} from '../repositories/proposal-repository.js';
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
 * Where an Administrator may move a handed-over Proposal to, and from where (issue #153):
 * `New → Taken up → Done`, and `Declined` from New or Taken up. Anything else is a conflict.
 */
const MOVES_FROM: Record<ProposalStatusRequest['status'], readonly HandedOverStatus[]> = {
  'taken-up': ['new'],
  done: ['taken-up'],
  declined: ['new', 'taken-up'],
};

/**
 * **Proposing a Fix or an Idea** (issue #152), and **handing it over** (issue #153): a Draft
 * started with what was on screen, a conversation about it a turn at a time, the finished
 * Proposal, and what becomes of it. A Draft is its author's alone, and somebody else's is
 * answered as one that does not exist; once handed over, everybody who may propose reads it.
 */
export interface ProposalService {
  start(proposer: Proposer, request: StartProposal): Promise<Proposal>;
  /** Their own Drafts, and every handed-over Proposal, or those standing at `status`. */
  list(
    proposer: Proposer,
    status: HandedOverStatus | null,
  ): Promise<{ drafts: ProposalListing[]; handedOver: ProposalListing[] }>;
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
   * **The finished Proposal**, written by the conversation and kept on the Draft. A `change` the
   * author asks for is kept as their turn first, so the summary is written again with it.
   */
  summarise(proposer: Proposer, proposalId: string, change: string | null): Promise<Proposal>;
  /** The author's Draft made New, which needs the finished Proposal they last read. */
  handOver(proposer: Proposer, proposalId: string): Promise<Proposal>;
  /** The author's Draft taken away. A handed-over Proposal is never taken away. */
  discard(proposer: Proposer, proposalId: string): Promise<void>;
  /** An Administrator's decision about a handed-over Proposal. The role is the caller's to check. */
  decide(proposer: Proposer, proposalId: string, decision: Decision): Promise<Proposal>;
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

export interface Decision {
  status: ProposalStatusRequest['status'];
  /** Required where Declining, and kept only then. */
  reason: string | null;
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

  /** One this proposer may read: their own, or one handed over. */
  async function visible(proposer: Proposer, proposalId: string): Promise<ProposalRow> {
    const proposal = await proposalRepository.findVisible(proposalId, proposer.accountId);
    if (proposal === null) {
      throw new NotFoundError('There is no such Proposal.');
    }
    return proposal;
  }

  /** The author's own Draft, and a conversation to have about it. */
  async function draft(
    proposer: Proposer,
    proposalId: string,
  ): Promise<{ proposal: ProposalRow; method: ConversationMethod }> {
    const proposal = await own(proposer, proposalId);
    if (proposal.status !== 'draft') {
      throw new ConflictError('This Proposal has been handed over, and its conversation is over.');
    }
    if (conversation === null) {
      throw new ConflictError('There is no conversation to be had here.');
    }
    return { proposal, method: conversation };
  }

  /**
   * What the method is told about this Draft: everything but who is asking. Each turn carries
   * the screenshots sent with it, so one taken off again is not shown in later turns.
   */
  async function told(proposal: ProposalRow): Promise<Conversation> {
    const [earlier, turns, screenshots] = await Promise.all([
      proposalRepository.listEarlier(),
      proposalRepository.listTurns(proposal.id),
      proposalRepository.listScreenshots(proposal.id),
    ]);
    return {
      kind: proposal.kind,
      context: contextOf(proposal),
      earlier,
      turns: await Promise.all(
        turns.map(async ({ id, speaker, text }) => ({
          speaker,
          text,
          screenshots: await Promise.all(
            screenshots.filter((shot) => shot.turnId === id).map(picture),
          ),
        })),
      ),
    };
  }

  async function whole(proposer: Proposer, proposal: ProposalRow): Promise<Proposal> {
    const [turns, screenshots] = await Promise.all([
      proposalRepository.listTurns(proposal.id),
      proposalRepository.listScreenshots(proposal.id),
    ]);
    const opening = turns.find((turn) => turn.speaker === 'author')?.text ?? null;
    return {
      ...listingOf(proposer, { proposal, opening }),
      turns: turns.map((turn) => turnOf(turn, screenshots)),
      summary: proposal.summary,
      declineReason: proposal.declineReason,
      // What waits to be sent is the author's alone, until a turn sends it.
      unsent:
        proposal.authorId === proposer.accountId
          ? screenshots.filter((shot) => shot.turnId === null).map(screenshotOf)
          : [],
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
      return whole(proposer, proposal);
    },

    async list(proposer, status) {
      const [drafts, handedOver] = await Promise.all([
        proposalRepository.listDrafts(proposer.accountId),
        proposalRepository.listHandedOver(status),
      ]);
      return {
        drafts: drafts.map((listed) => listingOf(proposer, listed)),
        handedOver: handedOver.map((listed) => listingOf(proposer, listed)),
      };
    },

    async read(proposer, proposalId) {
      return whole(proposer, await visible(proposer, proposalId));
    },

    async converse(proposer, proposalId, { text, screenshots: sent }, heard) {
      const { proposal, method } = await draft(proposer, proposalId);
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

      let answer = '';
      for await (const piece of method.answer(await told(proposal))) {
        answer += piece;
        heard(piece);
      }

      const answered = await proposalRepository.addTurn({
        proposalId,
        speaker: 'conversation',
        text: answer,
        at: clock.now(),
      });
      const shown = await proposalRepository.listScreenshots(proposalId);
      return [turnOf(asked, shown), turnOf(answered, [])];
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
      const { proposal } = await draft(proposer, proposalId);
      const removed = await proposalRepository.removeScreenshot(proposalId, screenshotId);
      if (removed === null) {
        if ((await own(proposer, proposalId)).status !== 'draft') {
          throw new ConflictError('A handed-over Proposal keeps what it was handed over with.');
        }
        throw new NotFoundError('There is no such screenshot on this Draft.');
      }
      await discardImageFiles(fileStore, proposalScreenshotKeyPrefix(removed.id));
      return whole(proposer, proposal);
    },

    async openScreenshot(proposer, screenshotId, variant) {
      const screenshot = await proposalRepository.findScreenshotReadableBy(
        screenshotId,
        proposer.accountId,
      );
      return screenshot ? openStoredImage({ fileStore, logger }, screenshot, variant) : null;
    },

    async summarise(proposer, proposalId, change) {
      const { proposal, method } = await draft(proposer, proposalId);
      if (change !== null) {
        await proposalRepository.addTurn({
          proposalId,
          speaker: 'author',
          text: change,
          at: clock.now(),
        });
      }

      const conversation = await told(proposal);
      const authorsWords = conversation.turns
        .filter((turn) => turn.speaker === 'author')
        .map((turn) => turn.text);
      if (authorsWords.length === 0) {
        throw new ConflictError('Say what you bring first; there is nothing to finish yet.');
      }

      const written = await method.summarise(conversation);
      if (written.kind !== proposal.kind) {
        throw new Error(`The conversation finished a ${written.kind} as a ${proposal.kind}.`);
      }
      const summary = { ...written, authorsWords } as ProposalSummary;
      const kept = await proposalRepository.keepSummary(proposalId, summary);
      if (kept === null) {
        throw new ConflictError(
          'This Proposal has been handed over, and its conversation is over.',
        );
      }
      return whole(proposer, kept);
    },

    async handOver(proposer, proposalId) {
      const proposal = await own(proposer, proposalId);
      if (proposal.status !== 'draft') {
        throw new ConflictError('This Proposal has already been handed over.');
      }
      const handedOver = await proposalRepository.handOver(proposalId, clock.now());
      if (handedOver === null) {
        const screenshots = await proposalRepository.listScreenshots(proposalId);
        if (screenshots.some((shot) => shot.turnId === null)) {
          throw new ConflictError(
            'A screenshot is waiting to be sent: send it with a turn, or remove it, first.',
          );
        }
        throw new ConflictError(
          'Read the finished Proposal before handing it over: ask for it, and it is written ' +
            'from the conversation as it now stands.',
        );
      }
      return whole(proposer, handedOver);
    },

    async discard(proposer, proposalId) {
      const proposal = await visible(proposer, proposalId);
      if (proposal.status !== 'draft') {
        throw new ConflictError('A handed-over Proposal stays, whatever becomes of it.');
      }
      const screenshots = await proposalRepository.listScreenshots(proposalId);
      if (!(await proposalRepository.discard(proposalId, proposer.accountId))) {
        throw new NotFoundError('There is no such Proposal of yours.');
      }
      for (const { id } of screenshots) {
        await discardImageFiles(fileStore, proposalScreenshotKeyPrefix(id));
      }
    },

    async decide(proposer, proposalId, { status, reason }) {
      const proposal = await visible(proposer, proposalId);
      const from = MOVES_FROM[status];
      const moved = from.includes(proposal.status as HandedOverStatus)
        ? await proposalRepository.move(
            proposalId,
            from,
            status,
            status === 'declined' ? reason : null,
          )
        : null;
      if (moved === null) {
        throw new ConflictError(
          `A Proposal that is ${STATUS_NAME[proposal.status]} cannot be made ` +
            `${STATUS_NAME[status]}.`,
        );
      }
      return whole(proposer, moved);
    },
  };
}

const STATUS_NAME: Record<ProposalRow['status'], string> = {
  draft: 'a Draft',
  new: 'New',
  'taken-up': 'Taken up',
  done: 'Done',
  declined: 'Declined',
};

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

function listingOf(proposer: Proposer, { proposal, opening }: ListedProposal): ProposalListing {
  return {
    id: proposal.id,
    kind: proposal.kind,
    status: proposal.status,
    title: proposal.summary?.title ?? null,
    context: contextOf(proposal),
    opening,
    mine: proposal.authorId === proposer.accountId,
    startedAt: proposal.startedAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
    handedOverAt: proposal.handedOverAt?.toISOString() ?? null,
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
