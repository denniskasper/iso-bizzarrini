import type { ErasureResponse, RetentionReport } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { Gate } from '../access/gate.js';
import type { RetentionService } from '../services/retention-service.js';

/**
 * Letting go of people (ADR 0007): one at a time on request, and by rule once they have been
 * gone long enough.
 *
 * **There is no address here that runs the sweep.** It is applied by the system once a day and
 * not by somebody remembering to press something, so what an Administrator gets is the dry run —
 * who the next one would delete — while there is still time to ask them.
 */
const accountIdParams = z.object({
  accountId: z.uuid('That is not somebody on the roster.'),
});

export interface RetentionController {
  report: RequestHandler;
  erase: RequestHandler;
}

export function createRetentionController(dependencies: {
  gate: Gate;
  retentionService: RetentionService;
}): RetentionController {
  const { gate, retentionService } = dependencies;

  return {
    report: async (_request, response) => {
      const body: RetentionReport = await retentionService.report();
      response.json(body);
    },

    erase: async (request, response) => {
      const { accountId } = accountIdParams.parse(request.params);

      // Who is asking, from the session — so that "not yourself" is not a thing a request can
      // get round by leaving a field out.
      const askedBy = gate.whoIsSignedIn(response).account.id;

      const body: ErasureResponse = { erased: await retentionService.erase(accountId, askedBy) };
      response.json(body);
    },
  };
}
