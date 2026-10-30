import type {
  SpecificationNamesResponse,
  SpecificationNameWrittenResponse,
  UnitsResponse,
  UnitWrittenResponse,
} from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { SpecificationListService } from '../services/specification-list-service.js';
import { required } from './fields.js';

const unitIdParams = z.object({ unitId: z.uuid('That is not a Unit id.') });
const nameIdParams = z.object({ nameId: z.uuid('That is not a Specification name id.') });

/** Reads `UnitSymbolRequest`. Trimmed; case is the Administrator's, because case is the Unit. */
const symbolBody = z.object({ symbol: required('A Unit needs a symbol') });

const unitId = z.uuid('That is not a Unit id.').nullable();

/** Reads `AddSpecificationNameRequest`. */
const addNameBody = z.object({
  name: required('A Specification name needs a name'),
  unitId,
});

/** Reads `CorrectSpecificationNameRequest`. An absent field is left as it is. */
const correctNameBody = z.object({
  name: required('A Specification name needs a name').optional(),
  unitId: unitId.optional(),
});

/**
 * Reads `SpecificationNameOrderRequest`: the whole list, as a statement about the list. A
 * duplicate is passed through to be refused, rather than quietly collapsed into an order nobody
 * chose.
 */
const orderBody = z.object({
  nameIds: z.array(z.uuid('That is not a Specification name id.')),
});

export interface SpecificationListController {
  listUnits: RequestHandler;
  addUnit: RequestHandler;
  renameUnit: RequestHandler;
  removeUnit: RequestHandler;
  listNames: RequestHandler;
  addName: RequestHandler;
  correctName: RequestHandler;
  orderNames: RequestHandler;
  removeName: RequestHandler;
}

export function createSpecificationListController(dependencies: {
  specificationListService: SpecificationListService;
}): SpecificationListController {
  const { specificationListService: lists } = dependencies;

  return {
    listUnits: async (_request, response) => {
      const body: UnitsResponse = { units: await lists.listUnits() };
      response.json(body);
    },

    addUnit: async (request, response) => {
      const { symbol } = symbolBody.parse(request.body);
      const body: UnitWrittenResponse = { unit: await lists.addUnit(symbol) };
      response.status(201).json(body);
    },

    renameUnit: async (request, response) => {
      const { unitId } = unitIdParams.parse(request.params);
      const { symbol } = symbolBody.parse(request.body);
      const body: UnitWrittenResponse = { unit: await lists.renameUnit(unitId, symbol) };
      response.json(body);
    },

    removeUnit: async (request, response) => {
      const { unitId } = unitIdParams.parse(request.params);
      await lists.removeUnit(unitId);
      response.status(204).end();
    },

    listNames: async (_request, response) => {
      const body: SpecificationNamesResponse = { specificationNames: await lists.listNames() };
      response.json(body);
    },

    addName: async (request, response) => {
      const { name, unitId } = addNameBody.parse(request.body);
      const body: SpecificationNameWrittenResponse = {
        specificationName: await lists.addName(name, unitId),
      };
      response.status(201).json(body);
    },

    correctName: async (request, response) => {
      const { nameId } = nameIdParams.parse(request.params);
      const body: SpecificationNameWrittenResponse = {
        specificationName: await lists.correctName(nameId, correctNameBody.parse(request.body)),
      };
      response.json(body);
    },

    orderNames: async (request, response) => {
      const { nameIds } = orderBody.parse(request.body);
      const body: SpecificationNamesResponse = {
        specificationNames: await lists.orderNames(nameIds),
      };
      response.json(body);
    },

    removeName: async (request, response) => {
      const { nameId } = nameIdParams.parse(request.params);
      await lists.removeName(nameId);
      response.status(204).end();
    },
  };
}
