import type { LandingResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ValidationError } from '../http/errors.js';
import type { VisitorService } from '../services/visitor-service.js';
import { blankToNull, required } from './fields.js';

/**
 * Reads `MembershipRequest`. Bounded, because whatever is typed here lands in the Club office's
 * inbox, and a form open to anybody is a form a script will try to fill with a novel.
 */
const membershipRequestBody = z.object({
  name: required('Your name is required').pipe(z.string().max(200, 'That name is too long')),
  email: z.string().trim().pipe(z.email('That is not an e-mail address the Club can answer')),
  cars: blankToNull().pipe(z.string().max(500, 'That is too long for the cars').nullable()),
  message: blankToNull().pipe(z.string().max(5000, 'That message is too long').nullable()),
  consent: z.literal(true, 'Your details go to the Club office only once you agree'),
  website: blankToNull(),
});

/** What somebody who has not signed in may read of the archive (ADR 0019), and ask of the Club. */
export interface VisitorController {
  readLanding: RequestHandler;
  askToJoin: RequestHandler;
}

export function createVisitorController(dependencies: {
  visitorService: VisitorService;
}): VisitorController {
  const { visitorService } = dependencies;

  return {
    readLanding: async (_request, response) => {
      const body: LandingResponse = { landing: await visitorService.landing() };
      response.json(body);
    },

    askToJoin: async (request, response) => {
      const { website, consent: _consent, ...asked } = membershipRequestBody.parse(request.body);
      // The field a person never sees. Refused in the words of any other refusal, so a script
      // learns nothing from the answer.
      if (website !== null) {
        throw new ValidationError('That request could not be sent.');
      }

      await visitorService.askToJoin(asked, request.ip ?? 'unknown');
      response.status(204).end();
    },
  };
}
