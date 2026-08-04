import type { PartRecordResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { NotFoundError, UnsupportedMediaTypeError, ValidationError } from '../http/errors.js';
import { sendImage } from '../http/served-image.js';
import { IMAGE_VARIANTS } from '../images/image-addresses.js';
import type { PhotographService } from '../services/photograph-service.js';

/**
 * Uploading, ordering, removing and serving photographs of a Part.
 *
 * **The upload is the request body, not a form field** — the same shape a scan uses, and for the
 * same reason: there is nothing else on the request to name, so the bytes arrive without being
 * base64'd or field-parsed on the way, and the size limit is enforced by the parser before a
 * handler ever sees them. What the file *is* is decided by reading it, never by what the request
 * claimed about itself.
 */

const partIdParams = z.object({ partId: z.uuid('That is not a Part id.') });
const photographIdParams = z.object({
  photographId: z.uuid('That is not a Photograph id.'),
});
const imageParams = photographIdParams.extend({ variant: z.enum(IMAGE_VARIANTS) });

/**
 * Reads `ReorderPhotographsRequest`. **The whole order, and every id a real one** — a list with a
 * duplicate in it is a browser that has lost track of what it is holding, and the archive would
 * rather say so than silently keep the last mention of each.
 */
const reorderBody = z.object({
  photographIds: z.array(z.uuid('That is not a Photograph id.')),
});

export interface PhotographController {
  upload: RequestHandler;
  reorder: RequestHandler;
  remove: RequestHandler;
  readImage: RequestHandler;
}

export function createPhotographController(dependencies: {
  photographService: PhotographService;
}): PhotographController {
  const { photographService } = dependencies;

  return {
    upload: async (request, response) => {
      const { partId } = partIdParams.parse(request.params);

      if (!Buffer.isBuffer(request.body)) {
        // Only reachable by sending `Content-Type: application/json`, which the app-level JSON
        // parser claims before this route sees it.
        throw new UnsupportedMediaTypeError('Send the photograph itself as the request body.');
      }
      if (request.body.byteLength === 0) {
        throw new ValidationError('That upload was empty.');
      }

      const body: PartRecordResponse = { part: await photographService.add(partId, request.body) };
      response.status(201).json(body);
    },

    reorder: async (request, response) => {
      const { partId } = partIdParams.parse(request.params);
      const { photographIds } = reorderBody.parse(request.body);

      const body: PartRecordResponse = {
        part: await photographService.reorder(partId, photographIds),
      };
      response.status(200).json(body);
    },

    remove: async (request, response) => {
      const { photographId } = photographIdParams.parse(request.params);

      const body: PartRecordResponse = { part: await photographService.remove(photographId) };
      response.status(200).json(body);
    },

    readImage: async (request, response, next) => {
      const { photographId, variant } = imageParams.parse(request.params);

      const image = await photographService.openImage(photographId, variant);
      if (!image) {
        throw new NotFoundError('No such photograph.');
      }

      sendImage(request, response, next, image);
    },
  };
}
