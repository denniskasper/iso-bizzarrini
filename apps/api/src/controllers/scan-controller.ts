import type { RequestHandler } from 'express';
import { z } from 'zod';
import { SCAN_VARIANTS } from '../images/scan-addresses.js';
import { NotFoundError, UnsupportedMediaTypeError, ValidationError } from '../http/errors.js';
import type { ScanService } from '../services/scan-service.js';

const tavolaIdParams = z.object({ tavolaId: z.uuid('That is not a Tavola id.') });
const imageParams = z.object({
  scanId: z.uuid('That is not a Scan id.'),
  variant: z.enum(SCAN_VARIANTS),
});

/**
 * A year. The address of an image in this archive never changes what it points at — a
 * re-upload is a new Scan and therefore a new address — so panning around a drawing re-requests
 * nothing, which is the whole reason ADR 0006 could put an authentication check in front of
 * every image and not care.
 *
 * `private` and not `public`: these are the Club's drawings and belong in one member's browser
 * cache, never in a shared one.
 */
const IMMUTABLE_FOR_A_YEAR = 'private, max-age=31536000, immutable';

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

      response.setHeader('Cache-Control', IMMUTABLE_FOR_A_YEAR);
      response.setHeader('ETag', image.etag);
      // What is served depends on who is asking, and a cache that forgets that serves a
      // drawing to someone who has been signed out.
      response.setHeader('Vary', 'Cookie');
      response.setHeader('Content-Type', image.contentType);
      response.setHeader('Content-Disposition', 'inline');

      if (request.headers['if-none-match'] === image.etag) {
        response.status(304).end();
        return;
      }

      response.setHeader('Content-Length', image.byteSize);

      const file = image.stream();
      file.on('error', (error: Error) => {
        // Nothing can be said politely once the first byte is out: cut the connection so the
        // browser sees a truncated response rather than a plausible half-drawing.
        if (response.headersSent) {
          response.destroy(error);
          return;
        }
        next(error);
      });
      file.pipe(response);
    },
  };
}
