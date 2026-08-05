import type { RosterImportPlan } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { Gate } from '../access/gate.js';
import type { RosterImportService } from '../services/roster-import-service.js';

/**
 * **The Club's membership list, arriving as a file** (ticket 16).
 *
 * Two addresses and not one flag, for the same reason bulk paste has two: what a preview does —
 * read the roster and answer — is what a `GET` does, and an address that records a hundred people
 * when a boolean is set wrong is one press away from a very bad afternoon.
 *
 * The file arrives as **text** rather than as an upload, because by the time it reaches here it is
 * a table and not a document: the browser reads the `.csv` the Administrator picked and sends what
 * is in it. That keeps one sheet reader serving the catalog's pastes and this, and keeps the
 * archive out of the business of guessing what a file was.
 */
const importBody = z.object({
  text: z.string(),
});

export interface RosterImportController {
  preview: RequestHandler;
  apply: RequestHandler;
}

export function createRosterImportController(dependencies: {
  gate: Gate;
  rosterImportService: RosterImportService;
}): RosterImportController {
  const { gate, rosterImportService } = dependencies;

  return {
    preview: async (request, response) => {
      const { text } = importBody.parse(request.body);
      const plan: RosterImportPlan = await rosterImportService.preview(text);
      response.json(plan);
    },

    apply: async (request, response) => {
      const { text } = importBody.parse(request.body);

      // Who loaded it, taken from the session rather than from the request — the same rule
      // recording a payment follows, and for the same reason: a term granted has to carry who
      // granted it, and that must not be something the request gets to claim.
      const importedBy = gate.whoIsSignedIn(response).account.id;

      const plan: RosterImportPlan = await rosterImportService.apply(text, importedBy);
      response.status(201).json(plan);
    },
  };
}
