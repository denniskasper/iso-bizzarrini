import type { PositionsResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { PositionService } from '../services/position-service.js';
import { required } from './fields.js';

const tavolaIdParams = z.object({ tavolaId: z.uuid('That is not a Tavola id.') });
const positionIdParams = z.object({ positionId: z.uuid('That is not a Position id.') });
const markIdParams = z.object({ markId: z.uuid('That is not a Mark id.') });
const subAssemblyIdParams = z.object({
  subAssemblyId: z.uuid('That is not a Sub-assembly id.'),
});
const linkIdParams = z.object({ linkId: z.uuid('That is not a link id.') });

/**
 * A point on the drawing, as fractions of it (ADR 0013). The bounds are the drawing's own
 * edges: a Mark outside them is not somewhere a member could ever click, so it is a bug in
 * whatever sent it rather than an unusual circle.
 */
const onTheDrawing = z.number().min(0, 'A Mark is somewhere on the drawing').max(1);
const markPoint = { x: onTheDrawing, y: onTheDrawing };

/** Reads `NewMarkRequest` from `@ricambi/contracts`, where the wire shape is declared. */
const placeMarkBody = z.object({
  number: required('A Position number is required'),
  ...markPoint,
});

const newPositionBody = z.object({ number: required('A Position number is required') });
const moveMarkBody = z.object(markPoint);

/**
 * Reads `NewSubAssemblyRequest`. **One with no numbers in it is refused**, because it is a name
 * for nothing — and because an empty Sub-assembly is swept the moment its last number leaves, one
 * created empty would not survive the request that made it.
 */
const newSubAssemblyBody = z.object({
  name: required('A Sub-assembly needs a name — what these numbers are together.'),
  positionIds: z
    .array(z.uuid('That is not a Position id.'))
    .min(1, 'A Sub-assembly is a name for some numbers. Choose at least one.'),
});

/**
 * Reads `RelatePositionsRequest`. The two ids are interchangeable — the pair is the link, and
 * which of them was typed first is nothing about the two parts.
 */
const relatePositionsBody = z.object({
  positionId: z.uuid('That is not a Position id.'),
  otherPositionId: z.uuid('That is not a Position id.'),
});

export interface PositionController {
  placeMark: RequestHandler;
  addPosition: RequestHandler;
  removePosition: RequestHandler;
  moveMark: RequestHandler;
  removeMark: RequestHandler;
  putInSubAssembly: RequestHandler;
  takeOutOfSubAssembly: RequestHandler;
  dissolveSubAssembly: RequestHandler;
  relate: RequestHandler;
  unrelate: RequestHandler;
}

export function createPositionController(dependencies: {
  positionService: PositionService;
}): PositionController {
  const { positionService } = dependencies;

  return {
    placeMark: async (request, response) => {
      const { tavolaId } = tavolaIdParams.parse(request.params);
      const { number, x, y } = placeMarkBody.parse(request.body);

      const body: PositionsResponse = await positionService.placeMark(tavolaId, number, { x, y });
      response.status(201).json(body);
    },

    addPosition: async (request, response) => {
      const { tavolaId } = tavolaIdParams.parse(request.params);
      const { number } = newPositionBody.parse(request.body);

      const { sheet, added } = await positionService.addPosition(tavolaId, number);
      const body: PositionsResponse = sheet;
      // 201 for a number the archive had not heard of, 200 for one it had. An Editor typing a
      // number that is already on the sheet has not made a mistake — the factory prints the
      // same one in several places — so this is a distinction, not a refusal.
      response.status(added ? 201 : 200).json(body);
    },

    removePosition: async (request, response) => {
      const { positionId } = positionIdParams.parse(request.params);
      const body: PositionsResponse = await positionService.removePosition(positionId);
      response.json(body);
    },

    moveMark: async (request, response) => {
      const { markId } = markIdParams.parse(request.params);
      const { x, y } = moveMarkBody.parse(request.body);

      const body: PositionsResponse = await positionService.moveMark(markId, { x, y });
      response.json(body);
    },

    removeMark: async (request, response) => {
      const { markId } = markIdParams.parse(request.params);
      const body: PositionsResponse = await positionService.removeMark(markId);
      response.json(body);
    },

    // 201 even for a Sub-assembly the sheet already had: what was created is the membership, and
    // an Editor adding three more numbers to *Door Lock* has recorded something either way.
    putInSubAssembly: async (request, response) => {
      const { tavolaId } = tavolaIdParams.parse(request.params);
      const { name, positionIds } = newSubAssemblyBody.parse(request.body);

      const body: PositionsResponse = await positionService.putInSubAssembly(
        tavolaId,
        name,
        positionIds,
      );
      response.status(201).json(body);
    },

    takeOutOfSubAssembly: async (request, response) => {
      const { positionId } = positionIdParams.parse(request.params);
      const body: PositionsResponse = await positionService.takeOutOfSubAssembly(positionId);
      response.json(body);
    },

    dissolveSubAssembly: async (request, response) => {
      const { subAssemblyId } = subAssemblyIdParams.parse(request.params);
      const body: PositionsResponse = await positionService.dissolveSubAssembly(subAssemblyId);
      response.json(body);
    },

    relate: async (request, response) => {
      const { tavolaId } = tavolaIdParams.parse(request.params);
      const { positionId, otherPositionId } = relatePositionsBody.parse(request.body);

      const body: PositionsResponse = await positionService.relate(
        tavolaId,
        positionId,
        otherPositionId,
      );
      response.status(201).json(body);
    },

    unrelate: async (request, response) => {
      const { linkId } = linkIdParams.parse(request.params);
      const body: PositionsResponse = await positionService.unrelate(linkId);
      response.json(body);
    },
  };
}
