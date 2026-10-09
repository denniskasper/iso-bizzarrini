import type { WaitingContributionsResponse, WaitingCountResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { Gate } from '../access/gate.js';
import type { ContributionReviewService } from '../services/contribution-review-service.js';
import { newListingBody } from './part-controller.js';

/**
 * An Editor working through what members have sent.
 *
 * Every handler asks the gate who is signed in for one small reason: the queue is made of
 * `Contribution`s, and each says whether it is the reader's own. An Editor is a Member too, and
 * what they wrote themselves waits here like anybody's.
 */

const contributionIdParams = z.object({
  contributionId: z.uuid('That is not a Contribution id.'),
});
const photographIdParams = z.object({
  photographId: z.uuid('That is not a Photograph id.'),
});

/** Reads `DecideContributionRequest`. Two words, and nothing that is neither. */
const decisionBody = z.object({
  decision: z.enum(['publish', 'discard'], 'A Contribution is published or discarded.'),
});

/**
 * Reads `RecordPartFromContributionRequest` — a new Listing, held to every rule a new Listing
 * is held to, with the Position left out because the Contribution already names it.
 */
const partFromContributionBody = newListingBody.refine(
  (body) => body.positionId === undefined || body.positionId === null,
  {
    message: 'The Position is the one the Contribution is about.',
    path: ['positionId'],
  },
);

export interface ContributionReviewController {
  listWaiting: RequestHandler;
  countWaiting: RequestHandler;
  decide: RequestHandler;
  recordPart: RequestHandler;
  promotePhotograph: RequestHandler;
}

export function createContributionReviewController(dependencies: {
  gate: Gate;
  contributionReviewService: ContributionReviewService;
}): ContributionReviewController {
  const { gate, contributionReviewService } = dependencies;

  return {
    listWaiting: async (_request, response) => {
      const who = gate.whoIsSignedIn(response);

      const body: WaitingContributionsResponse = await contributionReviewService.waiting(
        who.account.id,
      );
      response.json(body);
    },

    countWaiting: async (_request, response) => {
      const body: WaitingCountResponse = {
        waiting: await contributionReviewService.countWaiting(),
      };
      response.json(body);
    },

    decide: async (request, response) => {
      const { contributionId } = contributionIdParams.parse(request.params);
      const { decision } = decisionBody.parse(request.body);
      const who = gate.whoIsSignedIn(response);

      const body: WaitingContributionsResponse = await contributionReviewService.decide(
        who.account.id,
        contributionId,
        decision,
      );
      response.json(body);
    },

    recordPart: async (request, response) => {
      const { contributionId } = contributionIdParams.parse(request.params);
      const listing = partFromContributionBody.parse(request.body);
      const who = gate.whoIsSignedIn(response);

      const body: WaitingContributionsResponse = await contributionReviewService.recordPart(
        who.account.id,
        contributionId,
        {
          quantityPerCar: listing.quantityPerCar ?? null,
          drawn: listing.drawn,
          partId: listing.partId,
          part: listing.part,
        },
      );
      response.status(201).json(body);
    },

    promotePhotograph: async (request, response) => {
      const { photographId } = photographIdParams.parse(request.params);
      const who = gate.whoIsSignedIn(response);

      const body: WaitingContributionsResponse = await contributionReviewService.promotePhotograph(
        who.account.id,
        photographId,
      );
      response.json(body);
    },
  };
}
