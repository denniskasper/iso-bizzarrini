import type {
  Proposal,
  ProposalContext,
  ProposalKind,
  ProposalSummary,
  ProposalTurn,
} from '@ricambi/contracts';
import type { ProposalRow, ProposalTurnRow } from '../db/schema.js';
import { ConflictError, NotFoundError } from '../http/errors.js';
import type { Clock } from '../platform/clock.js';
import type { ConversationMethod } from '../proposals/conversation-method.js';
import type { ModelRepository } from '../repositories/model-repository.js';
import type { ProposalRepository } from '../repositories/proposal-repository.js';
import type { TavolaRepository } from '../repositories/tavola-repository.js';

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
    text: string,
    heard: (piece: string) => void,
  ): Promise<ProposalTurn[]>;
}

export function createProposalService(dependencies: {
  clock: Clock;
  /** Null where Proposals are closed here, which the gate has already refused. */
  conversation: ConversationMethod | null;
  /** The Version this server is, written onto every Draft started on it. */
  version: string;
  proposalRepository: ProposalRepository;
  modelRepository: ModelRepository;
  tavolaRepository: TavolaRepository;
}): ProposalService {
  const { clock, conversation, version, proposalRepository, modelRepository, tavolaRepository } =
    dependencies;

  async function own(proposer: Proposer, proposalId: string): Promise<ProposalRow> {
    const proposal = await proposalRepository.findOwn(proposalId, proposer.accountId);
    if (proposal === null) {
      throw new NotFoundError('There is no such Proposal of yours.');
    }
    return proposal;
  }

  async function whole(proposal: ProposalRow): Promise<Proposal> {
    const turns = await proposalRepository.listTurns(proposal.id);
    const opening = turns.find((turn) => turn.speaker === 'author')?.text ?? null;
    return { ...summaryOf(proposal, opening), turns: turns.map(turnOf) };
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

    async converse(proposer, proposalId, text, heard) {
      const proposal = await own(proposer, proposalId);
      if (proposal.status !== 'draft') {
        throw new ConflictError(
          'This Proposal has been handed over, and its conversation is over.',
        );
      }
      if (conversation === null) {
        throw new ConflictError('There is no conversation to be had here.');
      }

      const asked = await proposalRepository.addTurn({
        proposalId,
        speaker: 'author',
        text,
        at: clock.now(),
      });
      const turns = await proposalRepository.listTurns(proposalId);

      let answer = '';
      for await (const piece of conversation.answer({
        kind: proposal.kind,
        context: contextOf(proposal),
        turns: turns.map(({ speaker, text: said }) => ({ speaker, text: said })),
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
      return [turnOf(asked), turnOf(answered)];
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

function turnOf(turn: ProposalTurnRow): ProposalTurn {
  return {
    sequence: turn.sequence,
    speaker: turn.speaker,
    text: turn.text,
    at: turn.at.toISOString(),
  };
}
