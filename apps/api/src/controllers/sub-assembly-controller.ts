import type { SubAssemblyResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { SubAssemblyService } from '../services/sub-assembly-service.js';
import { blankToNull } from './fields.js';

const pageParams = z.object({
  tavolaId: z.uuid('That is not a Tavola id.'),
  subAssemblyId: z.uuid('That is not a Sub-assembly id.'),
});
const subAssemblyIdParams = z.object({
  subAssemblyId: z.uuid('That is not a Sub-assembly id.'),
});

/** Reads `SubAssemblyNoteRequest`. Blank is "not recorded", exactly as it is for a Part's Note. */
const noteBody = z.object({ note: blankToNull() });

export interface SubAssemblyController {
  read: RequestHandler;
  writeNote: RequestHandler;
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
  };
}
