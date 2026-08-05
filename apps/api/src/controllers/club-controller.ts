import type { ClubResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { CURRENCIES } from '../db/schema.js';
import type { ClubService } from '../services/club-service.js';
import { blankToNull, required } from './fields.js';

/**
 * The Club's own record: the fee, the bank details, the payment reference and the reminder text.
 *
 * Every field on the correction is optional, and that is the shape rather than laziness — a
 * screen changing the IBAN must not have to send the reminder text back to keep it, and a
 * treasurer who clears the BIC has said something different from one who did not touch it.
 */
const correctClubBody = z.object({
  fee: required('A fee is required').optional(),
  currency: z.enum(CURRENCIES).optional(),
  bankAccountHolder: blankToNull().optional(),
  bankName: blankToNull().optional(),
  iban: blankToNull().optional(),
  bic: blankToNull().optional(),
  paymentReference: required('A payment reference format is required').optional(),
  reminderText: required('A reminder text is required').optional(),
});

export interface ClubController {
  read: RequestHandler;
  correct: RequestHandler;
}

export function createClubController(dependencies: { clubService: ClubService }): ClubController {
  const { clubService } = dependencies;

  return {
    read: async (_request, response) => {
      const body: ClubResponse = { club: await clubService.read() };
      response.json(body);
    },

    correct: async (request, response) => {
      const body: ClubResponse = {
        club: await clubService.correct(correctClubBody.parse(request.body)),
      };
      response.json(body);
    },
  };
}
