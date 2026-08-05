import type { PastePlanResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { BulkPasteService } from '../services/bulk-paste-service.js';

const tavolaIdParams = z.object({ tavolaId: z.uuid('That is not a Tavola id.') });

/**
 * Reads `PasteRequest` from `@ricambi/contracts`.
 *
 * **Untrimmed, and that is deliberate**: a leading blank line is a row of the Editor's own table
 * and the line numbers reported back have to be the ones their spreadsheet shows beside it. What
 * a blank paste is gets answered by the service, in words about a paste rather than about a field.
 */
const pasteBody = z.object({ text: z.string() });

export interface BulkPasteController {
  preview: RequestHandler;
  apply: RequestHandler;
  spreadsheet: RequestHandler;
}

export function createBulkPasteController(dependencies: {
  bulkPasteService: BulkPasteService;
}): BulkPasteController {
  const { bulkPasteService } = dependencies;

  return {
    preview: async (request, response) => {
      const { tavolaId } = tavolaIdParams.parse(request.params);
      const { text } = pasteBody.parse(request.body);

      const body: PastePlanResponse = await bulkPasteService.preview(tavolaId, text);
      response.json(body);
    },

    apply: async (request, response) => {
      const { tavolaId } = tavolaIdParams.parse(request.params);
      const { text } = pasteBody.parse(request.body);

      const body: PastePlanResponse = await bulkPasteService.apply(tavolaId, text);
      response.status(201).json(body);
    },

    /**
     * The drawing as a file, because that is what it is for: an Editor opens it in the
     * spreadsheet they already have. It is behind the same gate as everything else, and a
     * browser that has been through that gate downloads it by following a link.
     */
    spreadsheet: async (request, response) => {
      const { tavolaId } = tavolaIdParams.parse(request.params);

      const { filename, csv } = await bulkPasteService.spreadsheet(tavolaId);
      response.type('text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      response.send(csv);
    },
  };
}
