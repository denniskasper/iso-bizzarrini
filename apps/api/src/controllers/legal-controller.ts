import type {
  LegalNoticeResponse,
  PrivacyResponse,
  ProcessorResponse,
  ProcessorsResponse,
} from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { PROCESSOR_ROLES } from '../db/schema.js';
import type { LegalService } from '../services/legal-service.js';
import { blankToNull, required } from './fields.js';

const processorParams = z.object({
  role: z.enum(PROCESSOR_ROLES, 'That is not a kind of processor the privacy statement names.'),
});

const nameProcessorBody = z.object({
  name: required('A processor needs a name'),
  location: required('Say where the data is handled — a country is enough'),
  agreementSignedOn: blankToNull(),
});

/**
 * The legal notice and the privacy statement, which anybody may read, and the association's
 * record of its processors, which is an Administrator's.
 */
export interface LegalController {
  readLegalNotice: RequestHandler;
  readPrivacy: RequestHandler;
  listProcessors: RequestHandler;
  nameProcessor: RequestHandler;
  removeProcessor: RequestHandler;
}

export function createLegalController(dependencies: {
  legalService: LegalService;
}): LegalController {
  const { legalService } = dependencies;

  return {
    readLegalNotice: async (_request, response) => {
      const body: LegalNoticeResponse = { legalNotice: await legalService.legalNotice() };
      response.json(body);
    },

    readPrivacy: async (_request, response) => {
      const body: PrivacyResponse = await legalService.privacy();
      response.json(body);
    },

    listProcessors: async (_request, response) => {
      const body: ProcessorsResponse = { processors: await legalService.processors() };
      response.json(body);
    },

    nameProcessor: async (request, response) => {
      const { role } = processorParams.parse(request.params);
      const body: ProcessorResponse = {
        processor: await legalService.nameProcessor(role, nameProcessorBody.parse(request.body)),
      };
      response.json(body);
    },

    removeProcessor: async (request, response) => {
      const { role } = processorParams.parse(request.params);
      await legalService.removeProcessor(role);
      response.status(204).end();
    },
  };
}
