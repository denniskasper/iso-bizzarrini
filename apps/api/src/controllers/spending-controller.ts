import type { SpendingResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import type { SpendingService } from '../services/spending-service.js';

/** **Spending** (issue #189): what Ricambi has spent on Claude, for an Administrator. */
export interface SpendingController {
  read: RequestHandler;
}

export function createSpendingController(dependencies: {
  spendingService: SpendingService;
}): SpendingController {
  const { spendingService } = dependencies;
  return {
    read: async (_request, response) => {
      const body: SpendingResponse = await spendingService.read();
      response.json(body);
    },
  };
}
