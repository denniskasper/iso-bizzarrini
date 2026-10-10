import type { ClubResponse, RenewalResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { Gate } from '../access/gate.js';
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
  officeEmail: blankToNull().optional(),
  remindersOn: z.boolean().optional(),
  treasurerEmail: blankToNull().optional(),
  legalName: blankToNull().optional(),
  postalAddress: blankToNull().optional(),
  representedBy: blankToNull().optional(),
  registerCourt: blankToNull().optional(),
  registerNumber: blankToNull().optional(),
  vatId: blankToNull().optional(),
  phone: blankToNull().optional(),
  legalNoticeFurther: blankToNull().optional(),
  dataProtectionContact: blankToNull().optional(),
  dataProtectionEmail: blankToNull().optional(),
  supervisoryAuthority: blankToNull().optional(),
  privacyFurther: blankToNull().optional(),
});

export interface ClubController {
  read: RequestHandler;
  correct: RequestHandler;
  /** What one member needs in order to pay. Everything above is an Administrator's; this is not. */
  readRenewal: RequestHandler;
}

export function createClubController(dependencies: {
  gate: Gate;
  clubService: ClubService;
}): ClubController {
  const { gate, clubService } = dependencies;

  return {
    read: async (_request, response) => {
      const body: ClubResponse = { club: await clubService.read() };
      response.json(body);
    },

    /**
     * **Read for the person asking**, which is why it takes nothing from the request. Whose
     * renewal this is comes from the session and cannot be claimed — otherwise the address would
     * be a way to ask what the Club has recorded about somebody else.
     */
    readRenewal: async (_request, response) => {
      const who = gate.whoIsSignedIn(response);
      const body: RenewalResponse = {
        renewal: await clubService.renewalFor({
          name: who.account.name,
          paidThrough: who.paidThrough,
        }),
      };
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
