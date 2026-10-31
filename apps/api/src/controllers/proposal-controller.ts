import type { ProposalAnswerEvent, ProposalResponse, ProposalsResponse } from '@ricambi/contracts';
import type { RequestHandler, Response } from 'express';
import { z } from 'zod';
import type { Gate } from '../access/gate.js';
import { PROPOSAL_KINDS } from '../db/schema.js';
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

const turnBody = z.object({
  text: required('Write something first').max(20_000, 'That is too long for one turn'),
});

export interface ProposalController {
  list: RequestHandler;
  start: RequestHandler;
  read: RequestHandler;
  converse: RequestHandler;
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
      const { text } = turnBody.parse(request.body);

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
          text,
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
  };
}
