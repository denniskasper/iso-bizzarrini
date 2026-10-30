import type { SubAssemblyResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { UnsupportedMediaTypeError, ValidationError } from '../http/errors.js';
import type { SubAssemblyService } from '../services/sub-assembly-service.js';
import { blankToNull } from './fields.js';

const pageParams = z.object({
  tavolaId: z.uuid('That is not a Tavola id.'),
  subAssemblyId: z.uuid('That is not a Sub-assembly id.'),
});
const subAssemblyIdParams = z.object({
  subAssemblyId: z.uuid('That is not a Sub-assembly id.'),
});
const photographParams = subAssemblyIdParams.extend({
  photographId: z.uuid('That is not a Photograph id.'),
});

/** Reads `SubAssemblyNoteRequest`. Blank is "not recorded", exactly as it is for a Part's Note. */
const noteBody = z.object({ note: blankToNull() });

/** Reads `ReorderPhotographsRequest`: the whole order, as a Part's is. */
const reorderBody = z.object({
  photographIds: z.array(z.uuid('That is not a Photograph id.')),
});

export interface SubAssemblyController {
  read: RequestHandler;
  writeNote: RequestHandler;
  addPhotograph: RequestHandler;
  reorderPhotographs: RequestHandler;
  removePhotograph: RequestHandler;
}

export function createSubAssemblyController(dependencies: {
  subAssemblyService: SubAssemblyService;
}): SubAssemblyController {
  const { subAssemblyService } = dependencies;

  return {
    read: async (request, response) => {
      const { tavolaId, subAssemblyId } = pageParams.parse(request.params);
      const body: SubAssemblyResponse = await subAssemblyService.read(tavolaId, subAssemblyId);
      response.json(body);
    },

    writeNote: async (request, response) => {
      const { subAssemblyId } = subAssemblyIdParams.parse(request.params);
      const { note } = noteBody.parse(request.body);
      const body: SubAssemblyResponse = await subAssemblyService.writeNote(subAssemblyId, note);
      response.json(body);
    },

    // The photograph is the request body, exactly as it is for a Part's.
    addPhotograph: async (request, response) => {
      const { subAssemblyId } = subAssemblyIdParams.parse(request.params);
      if (!Buffer.isBuffer(request.body)) {
        throw new UnsupportedMediaTypeError('Send the photograph itself as the request body.');
      }
      if (request.body.byteLength === 0) {
        throw new ValidationError('That upload was empty.');
      }
      const body: SubAssemblyResponse = await subAssemblyService.addPhotograph(
        subAssemblyId,
        request.body,
      );
      response.status(201).json(body);
    },

    reorderPhotographs: async (request, response) => {
      const { subAssemblyId } = subAssemblyIdParams.parse(request.params);
      const { photographIds } = reorderBody.parse(request.body);
      const body: SubAssemblyResponse = await subAssemblyService.reorderPhotographs(
        subAssemblyId,
        photographIds,
      );
      response.json(body);
    },

    removePhotograph: async (request, response) => {
      const { subAssemblyId, photographId } = photographParams.parse(request.params);
      const body: SubAssemblyResponse = await subAssemblyService.removePhotograph(
        subAssemblyId,
        photographId,
      );
      response.json(body);
    },
  };
}
