import type { ReadingDoubt, TavolaCheckingResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { NotFoundError } from '../http/errors.js';
import { sendImage } from '../http/served-image.js';
import type { CheckingService } from '../services/checking-service.js';
import { required } from './fields.js';

const tavolaIdParams = z.object({ tavolaId: z.uuid('That is not a Tavola id.') });
const tableSheetParams = tavolaIdParams.extend({
  sheet: z.coerce.number('That is not a Table sheet.').int().positive('That is not a Table sheet.'),
});
const doubtIdParams = z.object({ doubtId: z.uuid('That is not a doubt id.') });
/** Reads `RewriteDoubtRequest`. A doubt rewritten as nothing is one to clear instead. */
const rewriteDoubtBody = z.object({
  reason: required('Say what the doubt is, or clear it instead'),
});

export interface CheckingController {
  read: RequestHandler;
  readTableSheet: RequestHandler;
  rewriteDoubt: RequestHandler;
  clearDoubt: RequestHandler;
}

export function createCheckingController(dependencies: {
  checkingService: CheckingService;
}): CheckingController {
  const { checkingService } = dependencies;

  return {
    read: async (request, response) => {
      const { tavolaId } = tavolaIdParams.parse(request.params);
      const body: TavolaCheckingResponse = await checkingService.read(tavolaId);
      response.json(body);
    },

    readTableSheet: async (request, response, next) => {
      const { tavolaId, sheet } = tableSheetParams.parse(request.params);

      const image = await checkingService.openTableSheet(tavolaId, sheet);
      if (!image) {
        throw new NotFoundError('No such Table sheet.');
      }

      sendImage(request, response, next, image);
    },

    rewriteDoubt: async (request, response) => {
      const { doubtId } = doubtIdParams.parse(request.params);
      const { reason } = rewriteDoubtBody.parse(request.body);
      const doubt: ReadingDoubt = await checkingService.rewriteDoubt(doubtId, reason);
      response.json({ doubt });
    },

    clearDoubt: async (request, response) => {
      const { doubtId } = doubtIdParams.parse(request.params);
      await checkingService.clearDoubt(doubtId);
      response.status(204).end();
    },
  };
}
