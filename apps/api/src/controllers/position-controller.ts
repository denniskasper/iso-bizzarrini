import type { PositionsResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { PositionService } from '../services/position-service.js';
import { required } from './fields.js';

const tavolaIdParams = z.object({ tavolaId: z.uuid('That is not a Tavola id.') });
const positionIdParams = z.object({ positionId: z.uuid('That is not a Position id.') });
const markIdParams = z.object({ markId: z.uuid('That is not a Mark id.') });

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

export interface PositionController {
  placeMark: RequestHandler;
  addPosition: RequestHandler;
  removePosition: RequestHandler;
  moveMark: RequestHandler;
  removeMark: RequestHandler;
}

export function createPositionController(dependencies: {
  positionService: PositionService;
}): PositionController {
  const { positionService } = dependencies;

  return {
    placeMark: async (request, response) => {
      const { tavolaId } = tavolaIdParams.parse(request.params);
      const { number, x, y } = placeMarkBody.parse(request.body);

      const body: PositionsResponse = {
        positions: await positionService.placeMark(tavolaId, number, { x, y }),
      };
      response.status(201).json(body);
    },

    addPosition: async (request, response) => {
      const { tavolaId } = tavolaIdParams.parse(request.params);
      const { number } = newPositionBody.parse(request.body);

      const { positions, added } = await positionService.addPosition(tavolaId, number);
      const body: PositionsResponse = { positions };
      // 201 for a number the archive had not heard of, 200 for one it had. An Editor typing a
      // number that is already on the sheet has not made a mistake — the factory prints the
      // same one in several places — so this is a distinction, not a refusal.
      response.status(added ? 201 : 200).json(body);
    },

    removePosition: async (request, response) => {
      const { positionId } = positionIdParams.parse(request.params);
      const body: PositionsResponse = {
        positions: await positionService.removePosition(positionId),
      };
      response.json(body);
    },

    moveMark: async (request, response) => {
      const { markId } = markIdParams.parse(request.params);
      const { x, y } = moveMarkBody.parse(request.body);

      const body: PositionsResponse = {
        positions: await positionService.moveMark(markId, { x, y }),
      };
      response.json(body);
    },

    removeMark: async (request, response) => {
      const { markId } = markIdParams.parse(request.params);
      const body: PositionsResponse = { positions: await positionService.removeMark(markId) };
      response.json(body);
    },
  };
}
