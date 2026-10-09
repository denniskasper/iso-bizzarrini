import type {
  ContributionResponse,
  ContributionsResponse,
  ContributionTarget,
} from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { Gate } from '../access/gate.js';
import { NotFoundError, UnsupportedMediaTypeError, ValidationError } from '../http/errors.js';
import { sendImage } from '../http/served-image.js';
import { IMAGE_VARIANTS } from '../images/image-addresses.js';
import type { ContributionService } from '../services/contribution-service.js';

/**
 * Writing a Contribution, and reading the ones a member may see.
 *
 * **Every handler here asks the gate who is signed in**, which almost nothing else in the
 * archive needs to: a Part reads the same for everybody, and a Contribution does not. Who wrote
 * it is never something the request says about itself.
 */

const partIdParams = z.object({ partId: z.uuid('That is not a Part id.') });
const positionIdParams = z.object({ positionId: z.uuid('That is not a Position id.') });
const contributionIdParams = z.object({
  contributionId: z.uuid('That is not a Contribution id.'),
});
const imageParams = z.object({
  photographId: z.uuid('That is not a Photograph id.'),
  variant: z.enum(IMAGE_VARIANTS),
});

/**
 * Reads `NewContributionRequest`. **Only its shape** — what makes a Contribution worth sending is
 * the service's to say, in a sentence a member standing at a car can act on.
 */
const newContributionBody = z.object({
  text: z.string(),
  correction: z.boolean().optional().default(false),
});

export interface ContributionController {
  writeAboutPart: RequestHandler;
  writeAboutPosition: RequestHandler;
  readAtPosition: RequestHandler;
  attachPhotograph: RequestHandler;
  readImage: RequestHandler;
}

export function createContributionController(dependencies: {
  gate: Gate;
  contributionService: ContributionService;
}): ContributionController {
  const { gate, contributionService } = dependencies;

  /** The two addresses differ in what they are about and in nothing else. */
  function write(targetOf: (params: unknown) => ContributionTarget): RequestHandler {
    return async (request, response) => {
      const target = targetOf(request.params);
      const written = newContributionBody.parse(request.body);
      const who = gate.whoIsSignedIn(response);

      const body: ContributionResponse = {
        contribution: await contributionService.write(who.account.id, target, written),
      };
      response.status(201).json(body);
    };
  }

  return {
    writeAboutPart: write((params) => ({
      kind: 'part',
      partId: partIdParams.parse(params).partId,
    })),

    writeAboutPosition: write((params) => ({
      kind: 'position',
      positionId: positionIdParams.parse(params).positionId,
    })),

    readAtPosition: async (request, response) => {
      const { positionId } = positionIdParams.parse(request.params);
      const who = gate.whoIsSignedIn(response);

      const body: ContributionsResponse = {
        contributions: await contributionService.readAtPosition(who.account.id, positionId),
      };
      response.json(body);
    },

    attachPhotograph: async (request, response) => {
      const { contributionId } = contributionIdParams.parse(request.params);
      const who = gate.whoIsSignedIn(response);

      // The photograph is the body, as a Part's own is and for the same reasons.
      if (!Buffer.isBuffer(request.body)) {
        throw new UnsupportedMediaTypeError('Send the photograph itself as the request body.');
      }
      if (request.body.byteLength === 0) {
        throw new ValidationError('That upload was empty.');
      }

      const body: ContributionResponse = {
        contribution: await contributionService.attachPhotograph(
          who.account.id,
          contributionId,
          request.body,
        ),
      };
      response.status(201).json(body);
    },

    readImage: async (request, response, next) => {
      const { photographId, variant } = imageParams.parse(request.params);
      const who = gate.whoIsSignedIn(response);

      const image = await contributionService.openImage(who.account.id, photographId, variant);
      if (!image) {
        // The same answer for a photograph that does not exist and one this member may not see
        // yet, so that asking is no way of finding out which.
        throw new NotFoundError('No such photograph.');
      }

      sendImage(request, response, next, image);
    },
  };
}
