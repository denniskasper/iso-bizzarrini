import type { CategoriesResponse, TavolaResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { TavolaService } from '../services/tavola-service.js';
import { blankToNull, required } from './fields.js';

const modelIdParams = z.object({ modelId: z.uuid('That is not a Model id.') });
const tavolaIdParams = z.object({ tavolaId: z.uuid('That is not a Tavola id.') });

/** Reads `NewTavolaRequest` from `@ricambi/contracts`, where the wire shape is declared. */
const createTavolaBody = z.object({
  /** Kept as printed. Spacing inside is the factory's; spacing around it is a typing slip. */
  number: required('A Tavola number is required'),
  nameIt: required('The Italian name is required'),
  nameEn: required('The English name is required'),
  category: required('A Category is required'),
  /**
   * The factory's own Sezione, Gruppo and Sottogruppo. Optional, because plenty of sheets do
   * not print all three, and **recorded as written**: `SEZ.  26 / a` keeps both of its inner
   * spaces. Only the whitespace a form puts around a value is taken off.
   */
  catalogSection: blankToNull(),
  catalogGroup: blankToNull(),
  catalogSubgroup: blankToNull(),
});

export interface TavolaController {
  listCategories: RequestHandler;
  read: RequestHandler;
  create: RequestHandler;
}

export function createTavolaController(dependencies: {
  tavolaService: TavolaService;
}): TavolaController {
  const { tavolaService } = dependencies;

  return {
    listCategories: async (_request, response) => {
      const body: CategoriesResponse = await tavolaService.listCategories();
      response.json(body);
    },

    read: async (request, response) => {
      const { tavolaId } = tavolaIdParams.parse(request.params);
      const body: TavolaResponse = await tavolaService.readTavola(tavolaId);
      response.json(body);
    },

    create: async (request, response) => {
      const { modelId } = modelIdParams.parse(request.params);
      const tavola = await tavolaService.createTavola(
        modelId,
        createTavolaBody.parse(request.body),
      );
      response.status(201).json({ tavola });
    },
  };
}
