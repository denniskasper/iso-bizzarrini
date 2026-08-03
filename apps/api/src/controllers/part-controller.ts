import type {
  ListingResponse,
  PositionListingsResponse,
  TavolaListingsResponse,
} from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { PartService } from '../services/part-service.js';
import { blankToNull } from './fields.js';

const tavolaIdParams = z.object({ tavolaId: z.uuid('That is not a Tavola id.') });
const positionIdParams = z.object({ positionId: z.uuid('That is not a Position id.') });
const listingIdParams = z.object({ listingId: z.uuid('That is not a Listing id.') });

/**
 * Reads `NewPartRequest` from `@ricambi/contracts`, where the wire shape is declared.
 *
 * Every field is optional and blank means absent, because that is what an Editor leaving a field
 * alone means — and a Part that carries only a description is an ordinary Part (ADR 0001). The
 * one thing it may not be is nameless: a Part with neither name is a blank line in a list of
 * components, and no member could do anything with it.
 */
const partBody = z
  .object({
    nameEn: blankToNull(),
    nameIt: blankToNull(),
    catalogNumber: blankToNull(),
    disegnoOrigine: blankToNull(),
    description: blankToNull(),
    dimensions: blankToNull(),
    materialFinish: blankToNull(),
    catalogNote: blankToNull(),
    note: blankToNull(),
  })
  .refine((part) => part.nameEn !== null || part.nameIt !== null, {
    message: 'A Part needs a name in English or in Italian.',
    path: ['nameEn'],
  });

/**
 * Reads `NewListingRequest` from `@ricambi/contracts`.
 *
 * **Exactly one of `partId` and `part`.** A Part used on six drawings stays one Part, so the
 * second listing of it names it; a Part the archive has not met arrives whole. A request
 * carrying both is an Editor's tool contradicting itself, and one carrying neither has not said
 * what it is listing.
 */
const newListingBody = z
  .object({
    positionId: z.uuid('That is not a Position id.').nullish(),
    // A count of things fitted to a car. Zero is not a quantity, and the absence of one is
    // written as absent rather than as zero.
    quantityPerCar: z.number().int().positive('A quantity is a count of parts fitted').nullish(),
    drawn: z.boolean(),
    partId: z.uuid('That is not a Part id.').optional(),
    part: partBody.optional(),
  })
  .refine((body) => (body.partId === undefined) !== (body.part === undefined), {
    message: 'A Listing names an existing Part or records a new one, not both and not neither.',
    path: ['part'],
  });

export interface PartController {
  listAtPosition: RequestHandler;
  listOnTavola: RequestHandler;
  record: RequestHandler;
  removeListing: RequestHandler;
}

export function createPartController(dependencies: { partService: PartService }): PartController {
  const { partService } = dependencies;

  return {
    listAtPosition: async (request, response) => {
      const { positionId } = positionIdParams.parse(request.params);

      const body: PositionListingsResponse = {
        listings: await partService.listingsAt(positionId),
      };
      response.json(body);
    },

    listOnTavola: async (request, response) => {
      const { tavolaId } = tavolaIdParams.parse(request.params);

      const body: TavolaListingsResponse = { listings: await partService.listingsOn(tavolaId) };
      response.json(body);
    },

    record: async (request, response) => {
      const { tavolaId } = tavolaIdParams.parse(request.params);
      const listing = newListingBody.parse(request.body);

      const body: ListingResponse = {
        listing: await partService.record(tavolaId, {
          positionId: listing.positionId ?? null,
          quantityPerCar: listing.quantityPerCar ?? null,
          drawn: listing.drawn,
          partId: listing.partId,
          part: listing.part,
        }),
      };
      response.status(201).json(body);
    },

    removeListing: async (request, response) => {
      const { listingId } = listingIdParams.parse(request.params);
      await partService.removeListing(listingId);
      response.status(204).end();
    },
  };
}
