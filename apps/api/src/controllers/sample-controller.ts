import type { SampleResponse, SamplesResponse } from '@ricambi/contracts';
import type { RequestHandler, Response } from 'express';
import { z } from 'zod';
import type { Gate, SignedIn } from '../access/gate.js';
import { ForbiddenError, NotFoundError } from '../http/errors.js';
import type { Indexing } from '../http/indexing.js';
import { sendImage } from '../http/served-image.js';
import type { SampleService } from '../services/sample-service.js';

const tavolaIdParams = z.object({ tavolaId: z.uuid('That is not a Tavola id.') });
const drawingParams = z.object({ drawingId: z.uuid('That is not a Sample’s drawing.') });

/** Reads `ShowToVisitorsRequest`. */
const showBody = z.object({ positionId: z.uuid('Pick the number Visitors may read.') });

export interface SampleController {
  show: RequestHandler;
  stop: RequestHandler;
  list: RequestHandler;
  readDrawing: RequestHandler;
}

export function createSampleController(dependencies: {
  gate: Gate;
  sampleService: SampleService;
  indexing: Indexing;
}): SampleController {
  const { gate, sampleService, indexing } = dependencies;

  /**
   * **Showing the archive to the public is an Administrator's decision** (ADR 0019), asked here in
   * this decision's own words rather than the roster's: an Editor refused this is not being told
   * the roster is not theirs.
   */
  function anAdministrator(response: Response): SignedIn {
    const who = gate.whoIsSignedIn(response);
    if (who.account.role !== 'administrator') {
      throw new ForbiddenError('Showing a Tavola to Visitors is an Administrator’s decision.');
    }
    return who;
  }

  return {
    show: async (request, response) => {
      const who = anAdministrator(response);
      const { tavolaId } = tavolaIdParams.parse(request.params);
      const { positionId } = showBody.parse(request.body);
      const body: SampleResponse = {
        sample: await sampleService.show(tavolaId, positionId, who.account.id),
      };
      response.json(body);
    },

    stop: async (request, response) => {
      anAdministrator(response);
      const { tavolaId } = tavolaIdParams.parse(request.params);
      await sampleService.stop(tavolaId);
      response.status(204).end();
    },

    list: async (_request, response) => {
      anAdministrator(response);
      const body: SamplesResponse = await sampleService.list();
      response.json(body);
    },

    readDrawing: async (request, response, next) => {
      const { drawingId } = drawingParams.parse(request.params);
      const image = await sampleService.openDrawing(drawingId);
      if (!image) {
        throw new NotFoundError('No such drawing.');
      }
      // A Sample's picture is found with its page (issue #133); an address that is none is not.
      indexing.lift(response);
      sendImage(request, response, next, image, 'public');
    },
  };
}
