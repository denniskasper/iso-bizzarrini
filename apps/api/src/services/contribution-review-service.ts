import type {
  ContributionSubject,
  WaitingContribution,
  WaitingContributionsResponse,
} from '@ricambi/contracts';
import { ConflictError, NotFoundError } from '../http/errors.js';
import type {
  ContributionRepository,
  ContributionWithAuthor,
} from '../repositories/contribution-repository.js';
import type { PositionRepository } from '../repositories/position-repository.js';
import type { TavolaRepository } from '../repositories/tavola-repository.js';
import { toCatalogModel } from './catalog-view.js';
import { contributionsWithPhotographs } from './contribution-service.js';
import type { NewListing, PartService } from './part-service.js';

/**
 * Deciding Contributions — **the half an Editor does** (stories 115–120).
 *
 * There is no diff engine here and there is not meant to be one (spec, Out of Scope). An Editor
 * reads what a member wrote beside what the archive says, and then uses the tools the archive
 * already has: a good correction is an edit to the Part, made through `PartService` like any
 * other, and their hand is the audit trail. What this file adds is only what those tools could
 * not do — say what is waiting, decide it, and carry a member's picture or a member's gap across
 * into the record.
 *
 * **Every write answers with the queue, re-read.** Deciding one takes it out; recording a Part
 * from one changes what it is about; moving a photograph changes both the Contribution and the
 * Part beside it. None of that is derivable in a browser from the request that caused it.
 *
 * Nothing here asks whether the caller *may*, and that is deliberate rather than an oversight:
 * every address that reaches it is an Editor's (`api-router.ts`). The Editor's id is taken for
 * one small thing only — a `Contribution` says whether it is its reader's own, and an Editor is
 * a Member too.
 */

/** A Part to record at the number a Contribution is about. The Position is not the caller's. */
export type PartFromContribution = Omit<NewListing, 'positionId'>;

export interface ContributionReviewService {
  /** Everything nobody has decided, oldest first, each beside the record it is about. */
  waiting(editorId: string): Promise<WaitingContributionsResponse>;
  countWaiting(): Promise<number>;
  decide(
    editorId: string,
    contributionId: string,
    decision: 'publish' | 'discard',
  ): Promise<WaitingContributionsResponse>;
  /** A Part and Listing at the empty number, and the Contribution becomes that Part's. */
  recordPart(
    editorId: string,
    contributionId: string,
    part: PartFromContribution,
  ): Promise<WaitingContributionsResponse>;
  /** Moves one of a Contribution's photographs onto the Part it is about. */
  promotePhotograph(editorId: string, photographId: string): Promise<WaitingContributionsResponse>;
}

export function createContributionReviewService(dependencies: {
  contributionRepository: ContributionRepository;
  positionRepository: PositionRepository;
  tavolaRepository: TavolaRepository;
  partService: PartService;
}): ContributionReviewService {
  const { contributionRepository, positionRepository, tavolaRepository, partService } =
    dependencies;

  /**
   * The record as the archive has it *now*, read through the same service a member's screen
   * reads it through — so what an Editor judges against is what a member is being shown.
   *
   * One Contribution at a time. The queue is what one club's members sent since an Editor last
   * looked, and the alternative is a second way of assembling a Part that could come to disagree
   * with the first.
   */
  async function subjectOf(row: ContributionWithAuthor): Promise<ContributionSubject> {
    if (row.partId !== null) {
      return { kind: 'part', ...(await partService.readPart(row.partId)) };
    }

    // Both are held in place by the Contribution itself: a number cannot be removed from under
    // what a member wrote about it, and a sheet does not go while it has numbers.
    const position = row.positionId ? await positionRepository.findById(row.positionId) : null;
    const tavola = position ? await tavolaRepository.findById(position.tavolaId) : null;
    if (!position || !tavola) {
      throw new Error('A waiting Contribution is about a number the archive does not hold.');
    }

    return {
      kind: 'position',
      position: { id: position.id, number: position.number },
      tavola: {
        id: tavola.id,
        number: tavola.number,
        nameEn: tavola.nameEn,
        model: toCatalogModel(tavola.model),
      },
      listings: await partService.listingsAt(position.id),
    };
  }

  async function waiting(editorId: string): Promise<WaitingContributionsResponse> {
    const rows = await contributionRepository.listWaiting();
    const contributions = await contributionsWithPhotographs(
      contributionRepository,
      rows,
      editorId,
    );

    const queue: WaitingContribution[] = [];
    for (const [index, row] of rows.entries()) {
      const contribution = contributions[index];
      if (contribution) {
        queue.push({ contribution, subject: await subjectOf(row) });
      }
    }
    return { contributions: queue };
  }

  /** One that can still be acted on, or the refusal that says which reason it cannot. */
  async function stillWaiting(contributionId: string) {
    const contribution = await contributionRepository.find(contributionId);
    if (!contribution) {
      throw new NotFoundError('No such Contribution.');
    }
    if (contribution.state !== 'waiting') {
      throw alreadyDecided();
    }
    return contribution;
  }

  return {
    waiting,

    countWaiting: () => contributionRepository.countWaiting(),

    async decide(editorId, contributionId, decision) {
      await stillWaiting(contributionId);

      const decided = await contributionRepository.decide(
        contributionId,
        decision === 'publish' ? 'published' : 'discarded',
      );
      if (!decided) {
        // It was waiting a moment ago: another Editor decided it in between.
        throw alreadyDecided();
      }
      return waiting(editorId);
    },

    async recordPart(editorId, contributionId, part) {
      /*
       * Recorded through the archive's own door, so the merge-or-correct rule (ADR 0001) and
       * every refusal that goes with it are the ones an Editor meets everywhere else — and
       * recorded while the Contribution is held, so two Editors pressing at once make one Part.
       *
       * The Part is the archive's own write and is not undone if the Contribution's row then
       * cannot be: what that would leave is a Part an Editor recorded, which the archive is
       * always allowed to hold, beside a Contribution still waiting to be read.
       */
      const recorded = await contributionRepository.recordPartFor(
        contributionId,
        async (positionId) => {
          const position = await positionRepository.findById(positionId);
          if (!position) {
            throw new NotFoundError('No such Position.');
          }
          const listing = await partService.record(position.tavolaId, { ...part, positionId });
          return listing.part.id;
        },
      );

      if (recorded === 'missing') {
        throw new NotFoundError('No such Contribution.');
      }
      if (recorded === 'decided') {
        throw alreadyDecided();
      }
      if (recorded === 'about-a-part') {
        throw new ConflictError(
          'This Contribution is already about a Part. Correct that Part instead.',
        );
      }
      return waiting(editorId);
    },

    async promotePhotograph(editorId, photographId) {
      const moved = await contributionRepository.movePhotographToPart(photographId);
      if (moved === 'missing') {
        throw new NotFoundError('No such photograph.');
      }
      if (moved === 'decided') {
        throw alreadyDecided();
      }
      if (moved === 'about-a-position') {
        throw new ConflictError(
          'There is no Part here for this photograph to go onto yet. Record the Part first.',
        );
      }
      return waiting(editorId);
    },
  };
}

function alreadyDecided(): ConflictError {
  return new ConflictError('This Contribution has already been decided.');
}
