import type { RequestHandler } from 'express';
import type { StatusService } from '../services/status-service.js';

export interface StatusController {
  read: RequestHandler;
}

export function createStatusController(dependencies: {
  statusService: StatusService;
}): StatusController {
  const { statusService } = dependencies;

  return {
    read: async (_request, response) => {
      const status = await statusService.read();
      response.status(status.status === 'ok' ? 200 : 503).json(status);
    },
  };
}
