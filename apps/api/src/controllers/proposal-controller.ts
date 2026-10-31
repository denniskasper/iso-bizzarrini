import type {
  ProposalAnswerEvent,
  ProposalResponse,
  ProposalScreenshotResponse,
  ProposalsResponse,
} from '@ricambi/contracts';
import type { RequestHandler, Response } from 'express';
import { z } from 'zod';
import type { Gate } from '../access/gate.js';
import { PROPOSAL_KINDS } from '../db/schema.js';
import { NotFoundError, UnsupportedMediaTypeError, ValidationError } from '../http/errors.js';
import { sendImage } from '../http/served-image.js';
import { IMAGE_VARIANTS } from '../images/image-addresses.js';
import type { Logger } from '../platform/logger.js';
import type { Proposer, ProposalService } from '../services/proposal-service.js';
import { required } from './fields.js';

const proposalParams = z.object({
  proposalId: z.uuid('There is no such Proposal of yours.'),
});

const startBody = z.object({
  kind: z.enum(PROPOSAL_KINDS, 'A Proposal is either a Fix or an Idea.'),
  pageAddress: required('The page the Proposal is about is required')
    .max(2000, 'That page address is too long to be one of Ricambi’s')
    .refine((address) => address.startsWith('/'), 'The page address is a path on this site'),
  modelId: z
    .uuid()
    .nullish()
    .transform((id) => id ?? null),
  tavolaId: z
    .uuid()
    .nullish()
    .transform((id) => id ?? null),
});

const screenshotParams = proposalParams.extend({
  screenshotId: z.uuid('There is no such screenshot on this Draft.'),
});

const screenshotImageParams = z.object({
  screenshotId: z.uuid('No such screenshot.'),
  variant: z.enum(IMAGE_VARIANTS),
});

const turnBody = z.object({
  text: required('Write something first').max(20_000, 'That is too long for one turn'),
  screenshots: z
    .array(
      z.object({
        id: z.uuid('That is not a screenshot of this Draft.'),
        note: z
          .string()
          .trim()
          .max(2000, 'That note is too long for one screenshot')
          .nullish()
          .transform((note) => (note ? note : null)),
      }),
    )
    .max(20, 'Send at most twenty screenshots with one turn')
    .default([]),
});

export interface ProposalController {
  list: RequestHandler;
  start: RequestHandler;
  read: RequestHandler;
  converse: RequestHandler;
  show: RequestHandler;
  removeScreenshot: RequestHandler;
  readScreenshot: RequestHandler;
}

/**
 * **Proposing** (issue #152). Every address here is behind `requireProposer`, and every one of
 * them is about the proposer's own Proposals.
 */
export function createProposalController(dependencies: {
  gate: Gate;
  proposalService: ProposalService;
  logger: Logger;
}): ProposalController {
  const { gate, proposalService, logger } = dependencies;

  function proposer(response: Response): Proposer {
    return {
      accountId: gate.whoIsSignedIn(response).account.id,
      seesUnchecked: gate.seesUnchecked(response),
    };
  }

  return {
    list: async (_request, response) => {
      const body: ProposalsResponse = {
        drafts: await proposalService.listDrafts(proposer(response)),
      };
      response.json(body);
    },

    start: async (request, response) => {
      const body: ProposalResponse = {
        proposal: await proposalService.start(proposer(response), startBody.parse(request.body)),
      };
      response.status(201).json(body);
    },

    read: async (request, response) => {
      const { proposalId } = proposalParams.parse(request.params);
      const body: ProposalResponse = {
        proposal: await proposalService.read(proposer(response), proposalId),
      };
      response.json(body);
    },

    /**
     * **The answer as it is written**, a line of JSON per piece. Nothing is written until the
     * first piece arrives, so a refusal before then is an ordinary error answered as JSON; a
     * failure after it can only be said on the stream itself, as its last line.
     */
    converse: async (request, response) => {
      const { proposalId } = proposalParams.parse(request.params);
      const turn = turnBody.parse(request.body);

      const send = (event: ProposalAnswerEvent): void => {
        if (!response.headersSent) {
          response.status(200);
          response.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
          response.setHeader('cache-control', 'no-store');
          response.flushHeaders();
        }
        response.write(`${JSON.stringify(event)}\n`);
      };

      try {
        const turns = await proposalService.converse(
          proposer(response),
          proposalId,
          turn,
          (piece) => send({ type: 'text', text: piece }),
        );
        send({ type: 'answered', turns });
      } catch (error) {
        if (!response.headersSent) {
          throw error;
        }
        logger.error({ err: error, proposalId }, 'The conversation stopped mid-answer');
        send({
          type: 'failed',
          message:
            'The conversation stopped before it finished answering. What you wrote is kept; ' +
            'write again to carry on.',
        });
      }
      response.end();
    },

    /** **A screenshot pasted or picked** (issue #154): the picture is the body, as a Photograph's is. */
    show: async (request, response) => {
      const { proposalId } = proposalParams.parse(request.params);
      if (!Buffer.isBuffer(request.body)) {
        throw new UnsupportedMediaTypeError('Send the screenshot itself as the request body.');
      }
      if (request.body.byteLength === 0) {
        throw new ValidationError('That upload was empty.');
      }
      const body: ProposalScreenshotResponse = {
        screenshot: await proposalService.show(proposer(response), proposalId, request.body),
      };
      response.status(201).json(body);
    },

    removeScreenshot: async (request, response) => {
      const { proposalId, screenshotId } = screenshotParams.parse(request.params);
      const body: ProposalResponse = {
        proposal: await proposalService.removeScreenshot(
          proposer(response),
          proposalId,
          screenshotId,
        ),
      };
      response.json(body);
    },

    readScreenshot: async (request, response, next) => {
      const { screenshotId, variant } = screenshotImageParams.parse(request.params);
      const image = await proposalService.openScreenshot(proposer(response), screenshotId, variant);
      if (!image) {
        throw new NotFoundError('No such screenshot.');
      }
      sendImage(request, response, next, image);
    },
  };
}
