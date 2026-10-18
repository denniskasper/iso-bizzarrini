import type {
  ListingResponse,
  PartResponse,
  PartLookupResponse,
  PositionListingsResponse,
  TavolaListingsResponse,
} from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import type { Gate } from '../access/gate.js';
import { z } from 'zod';
import type { PartService } from '../services/part-service.js';
import { blankToNull, englishNameBody, required } from './fields.js';

const tavolaIdParams = z.object({ tavolaId: z.uuid('That is not a Tavola id.') });
const positionIdParams = z.object({ positionId: z.uuid('That is not a Position id.') });
const listingIdParams = z.object({ listingId: z.uuid('That is not a Listing id.') });
const partIdParams = z.object({ partId: z.uuid('That is not a Part id.') });

/**
 * What an Editor typed into the lookup. **Something**, because a blank query is not a search for
 * every Part in the archive — it is a field nobody has finished typing into yet.
 */
const lookupQuery = z.object({
  q: required('Type a catalog number, or the start of a name.'),
});

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
 * Reads `CorrectListingRequest` from `@ricambi/contracts` — the three fields a Listing has of its
 * own, held to the same rules as the ones on a new Listing because they are the same fields.
 *
 * **No Part on it, deliberately.** Correcting the Part is `PATCH /api/parts/:partId`; a
 * Listing that could be pointed at another Part would be a way of editing two records at once.
 */
const correctedListingBody = z.object({
  positionId: z.uuid('That is not a Position id.').nullish(),
  // A count of things fitted to a car. Zero is not a quantity, and the absence of one is
  // written as absent rather than as zero.
  quantityPerCar: z.number().int().positive('A quantity is a count of parts fitted').nullish(),
  drawn: z.boolean(),
});

/**
 * Reads `NewListingRequest` from `@ricambi/contracts`.
 *
 * **Exactly one of `partId` and `part`.** A Part used on six drawings stays one Part, so the
 * second listing of it names it; a Part the archive has not met arrives whole. A request
 * carrying both is an Editor's tool contradicting itself, and one carrying neither has not said
 * what it is listing.
 *
 * Exported for the one other address that records a Listing: a Part recorded from a member's
 * Contribution (`contribution-review-controller.ts`) is held to exactly these rules.
 */
export const newListingBody = correctedListingBody
  .extend({
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
  correctListing: RequestHandler;
  removeListing: RequestHandler;

  lookUp: RequestHandler;
  read: RequestHandler;
  correct: RequestHandler;
  nameInEnglish: RequestHandler;
  remove: RequestHandler;
}

export function createPartController(dependencies: {
  gate: Gate;
  partService: PartService;
}): PartController {
  const { gate, partService } = dependencies;

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

    correctListing: async (request, response) => {
      const { listingId } = listingIdParams.parse(request.params);
      const listing = correctedListingBody.parse(request.body);

      const body: ListingResponse = {
        listing: await partService.correctListing(listingId, {
          positionId: listing.positionId ?? null,
          quantityPerCar: listing.quantityPerCar ?? null,
          drawn: listing.drawn,
        }),
      };
      response.json(body);
    },

    removeListing: async (request, response) => {
      const { listingId } = listingIdParams.parse(request.params);
      await partService.removeListing(listingId);
      response.status(204).end();
    },

    lookUp: async (request, response) => {
      const { q } = lookupQuery.parse(request.query);

      const body: PartLookupResponse = await partService.lookUpParts(
        q,
        gate.seesUnchecked(response),
      );
      response.json(body);
    },

    read: async (request, response) => {
      const { partId } = partIdParams.parse(request.params);

      const body: PartResponse = await partService.readPart(partId, gate.seesUnchecked(response));
      response.json(body);
    },

    correct: async (request, response) => {
      const { partId } = partIdParams.parse(request.params);

      const body: PartResponse = await partService.correctPart(
        partId,
        partBody.parse(request.body),
      );
      response.json(body);
    },

    nameInEnglish: async (request, response) => {
      const { partId } = partIdParams.parse(request.params);
      const { nameEn } = englishNameBody.parse(request.body);
      const body: PartResponse = await partService.nameInEnglish(partId, nameEn);
      response.json(body);
    },

    remove: async (request, response) => {
      const { partId } = partIdParams.parse(request.params);
      await partService.removePart(partId);
      response.status(204).end();
    },
  };
}
