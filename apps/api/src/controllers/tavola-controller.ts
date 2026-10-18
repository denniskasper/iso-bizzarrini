import type { TavolaPublishedResponse, TavolaResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import type { Gate } from '../access/gate.js';
import { z } from 'zod';
import type { TavolaService } from '../services/tavola-service.js';
import { blankToNull, englishNameBody, required } from './fields.js';

const modelIdParams = z.object({ modelId: z.uuid('That is not a Model id.') });
const tavolaIdParams = z.object({ tavolaId: z.uuid('That is not a Tavola id.') });

/** Reads `NewTavolaRequest` from `@ricambi/contracts`, where the wire shape is declared. */
const createTavolaBody = z.object({
  /** Kept as printed. Spacing inside is the factory's; spacing around it is a typing slip. */
  number: required('A Tavola number is required'),
  nameIt: required('The Italian name is required'),
  nameEn: required('The English name is required'),
  /**
   * Optional. A sheet can be recorded before anybody has decided which system it belongs to,
   * and one that is filed nowhere is still on its Model's sheet.
   */
  category: blankToNull(),
  /**
   * The factory's own Sezione, Gruppo and Sottogruppo. Optional, because plenty of sheets do
   * not print all three, and **recorded as written**: `SEZ.  26 / a` keeps both of its inner
   * spaces. Only the whitespace a form puts around a value is taken off.
   */
  catalogSection: blankToNull(),
  catalogGroup: blankToNull(),
  catalogSubgroup: blankToNull(),
});

/** Reads `TavolaCategoryRequest`. Blank is how a sheet is taken out of its Category. */
const categoriseBody = z.object({ category: blankToNull() });

export interface TavolaController {
  read: RequestHandler;
  create: RequestHandler;
  categorise: RequestHandler;
  publish: RequestHandler;
  nameInEnglish: RequestHandler;
}

export function createTavolaController(dependencies: {
  gate: Gate;
  tavolaService: TavolaService;
}): TavolaController {
  const { gate, tavolaService } = dependencies;

  return {
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

    categorise: async (request, response) => {
      const { tavolaId } = tavolaIdParams.parse(request.params);
      const { category } = categoriseBody.parse(request.body);
      const tavola = await tavolaService.categorise(tavolaId, category);
      response.json({ tavola });
    },

    nameInEnglish: async (request, response) => {
      const { tavolaId } = tavolaIdParams.parse(request.params);
      const { nameEn } = englishNameBody.parse(request.body);
      const tavola = await tavolaService.nameInEnglish(tavolaId, nameEn);
      response.json({ tavola });
    },

    publish: async (request, response) => {
      const { tavolaId } = tavolaIdParams.parse(request.params);
      const who = gate.whoIsSignedIn(response);
      const body: TavolaPublishedResponse = {
        tavola: await tavolaService.publish(tavolaId, who.account.id),
      };
      response.json(body);
    },
  };
}
