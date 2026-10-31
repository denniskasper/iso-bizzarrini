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
import {
  ForbiddenError,
  NotFoundError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '../http/errors.js';
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

const turnText = required('Write something first').max(20_000, 'That is too long for one turn');

const summaryBody = z
  .object({ change: turnText.optional() })
  .optional()
  .transform((body) => body?.change ?? null);

const listQuery = z.object({
  status: z
    .enum(['new', 'taken-up', 'done', 'declined'], 'Proposals are filtered by where they stand.')
    .optional()
    .transform((status) => status ?? null),
});

const screenshotParams = proposalParams.extend({
  screenshotId: z.uuid('There is no such screenshot on this Draft.'),
});

const screenshotImageParams = z.object({
  screenshotId: z.uuid('No such screenshot.'),
  variant: z.enum(IMAGE_VARIANTS),
});

const turnBody = z.object({
  text: turnText,
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

const decisionBody = z
  .object({
    status: z.enum(
      ['taken-up', 'done', 'declined'],
      'A Proposal is Taken up, Done or Declined; it is New only by being handed over.',
    ),
    reason: z.string().trim().max(2000, 'That reason is too long').optional(),
  })
  .transform(({ status, reason }) => ({ status, reason: reason || null }))
  .refine(
    ({ status, reason }) => status !== 'declined' || reason !== null,
    'Say why it is Declined: its author is shown the reason.',
  );

export interface ProposalController {
  list: RequestHandler;
  start: RequestHandler;
  read: RequestHandler;
  converse: RequestHandler;
  summarise: RequestHandler;
  handOver: RequestHandler;
  discard: RequestHandler;
  decide: RequestHandler;
  show: RequestHandler;
  removeScreenshot: RequestHandler;
  readScreenshot: RequestHandler;
}

/**
 * **Proposing** (issue #152) and **handing over** (issue #153). Every address here is behind
 * `requireProposer`; a Draft is its author's alone, and a handed-over Proposal everybody's who
 * may propose. Only an Administrator decides what becomes of one.
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
    list: async (request, response) => {
      const { status } = listQuery.parse(request.query);
      const body: ProposalsResponse = await proposalService.list(proposer(response), status);
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

    summarise: async (request, response) => {
      const { proposalId } = proposalParams.parse(request.params);
      const change = summaryBody.parse(request.body);
      const body: ProposalResponse = {
        proposal: await proposalService.summarise(proposer(response), proposalId, change),
      };
      response.json(body);
    },

    handOver: async (request, response) => {
      const { proposalId } = proposalParams.parse(request.params);
      const body: ProposalResponse = {
        proposal: await proposalService.handOver(proposer(response), proposalId),
      };
      response.json(body);
    },

    discard: async (request, response) => {
      const { proposalId } = proposalParams.parse(request.params);
      await proposalService.discard(proposer(response), proposalId);
      response.status(204).end();
    },

    decide: async (request, response) => {
      if (gate.whoIsSignedIn(response).account.role !== 'administrator') {
        throw new ForbiddenError('What becomes of a Proposal is an Administrator’s to decide.');
      }
      const { proposalId } = proposalParams.parse(request.params);
      const decision = decisionBody.parse(request.body);
      const body: ProposalResponse = {
        proposal: await proposalService.decide(proposer(response), proposalId, decision),
      };
      response.json(body);
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
