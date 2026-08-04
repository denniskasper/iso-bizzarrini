import type { RequestHandler } from 'express';
import { z } from 'zod';
import { IMAGE_VARIANTS } from '../images/image-addresses.js';
import { NotFoundError, UnsupportedMediaTypeError, ValidationError } from '../http/errors.js';
import { sendImage } from '../http/served-image.js';
import type { ScanService } from '../services/scan-service.js';

const tavolaIdParams = z.object({ tavolaId: z.uuid('That is not a Tavola id.') });
const imageParams = z.object({
  scanId: z.uuid('That is not a Scan id.'),
  variant: z.enum(IMAGE_VARIANTS),
});

export interface ScanController {
  upload: RequestHandler;
  readImage: RequestHandler;
}

export function createScanController(dependencies: { scanService: ScanService }): ScanController {
  const { scanService } = dependencies;

  return {
    /**
     * The upload is the request body, not a form field. An Editor picks a file and the browser
     * sends it; there is nothing else on this request to name, so there is nothing multipart
     * could carry, and the bytes arrive without being base64'd or field-parsed on the way.
     *
     * What the file *is* is decided by reading it, never by what the request claimed.
     */
    upload: async (request, response) => {
      const { tavolaId } = tavolaIdParams.parse(request.params);

      if (!Buffer.isBuffer(request.body)) {
        // Only reachable by sending `Content-Type: application/json`, which the app-level JSON
        // parser claims before this route sees it.
        throw new UnsupportedMediaTypeError('Send the scan itself as the request body.');
      }
      if (request.body.byteLength === 0) {
        throw new ValidationError('That upload was empty.');
      }

      const scan = await scanService.ingest(tavolaId, request.body);
      response.status(201).json({ scan });
    },

    readImage: async (request, response, next) => {
      const { scanId, variant } = imageParams.parse(request.params);

      const image = await scanService.openImage(scanId, variant);
      if (!image) {
        throw new NotFoundError('No such scan.');
      }

      sendImage(request, response, next, image);
    },
  };
}
