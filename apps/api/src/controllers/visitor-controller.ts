import type { LandingResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import type { VisitorService } from '../services/visitor-service.js';

/** What somebody who has not signed in may read of the archive (ADR 0019). */
export interface VisitorController {
  readLanding: RequestHandler;
}

export function createVisitorController(dependencies: {
  visitorService: VisitorService;
}): VisitorController {
  const { visitorService } = dependencies;

  return {
    readLanding: async (_request, response) => {
      const body: LandingResponse = { landing: await visitorService.landing() };
      response.json(body);
    },
  };
}
