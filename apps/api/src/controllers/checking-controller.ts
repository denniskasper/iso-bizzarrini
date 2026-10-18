import type { TavolaCheckingResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { NotFoundError } from '../http/errors.js';
import { sendImage } from '../http/served-image.js';
import type { CheckingService } from '../services/checking-service.js';

const tavolaIdParams = z.object({ tavolaId: z.uuid('That is not a Tavola id.') });
const tableSheetParams = tavolaIdParams.extend({
  sheet: z.coerce.number('That is not a Table sheet.').int().positive('That is not a Table sheet.'),
});

export interface CheckingController {
  read: RequestHandler;
  readTableSheet: RequestHandler;
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
  };
}
