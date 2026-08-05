import type { RosterEntryResponse, RosterResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { Gate } from '../access/gate.js';
import { CURRENCIES, ROLES } from '../db/schema.js';
import type { RosterService } from '../services/roster-service.js';
import { blankToNull, required } from './fields.js';

/**
 * The roster, and the two things an Administrator does to it.
 *
 * **Nothing here ever carries a password**, in either direction. An Administrator adds a person
 * and the system sends them a link; the member chooses what nobody else will ever know (story 3).
 * There is no field on any of these requests that could set one.
 */
const accountIdParams = z.object({
  accountId: z.uuid('That is not somebody on the roster.'),
});

const newMemberBody = z.object({
  name: required('A name is required'),
  email: required('An e-mail address is required'),
  paidThrough: required('A Paid-through date is required'),
  role: z.enum(ROLES).optional(),
});

const correctMemberBody = z.object({
  name: z.string().trim().min(1, 'A member needs a name').optional(),
  role: z.enum(ROLES).optional(),
});

/**
 * The amount is optional and its currency is not: a term granted for nothing is a thing a Club
 * does, and a figure with no currency beside it is not a thing anybody can bank.
 */
const paymentBody = z.object({
  amount: blankToNull(),
  currency: z.enum(CURRENCIES),
  receivedOn: required('The date the money arrived is required'),
  reference: blankToNull(),
  paidThrough: required('A Paid-through date is required'),
});

export interface RosterController {
  list: RequestHandler;
  add: RequestHandler;
  invite: RequestHandler;
  correct: RequestHandler;
  recordPayment: RequestHandler;
}

export function createRosterController(dependencies: {
  gate: Gate;
  rosterService: RosterService;
}): RosterController {
  const { gate, rosterService } = dependencies;

  return {
    list: async (_request, response) => {
      const body: RosterResponse = { members: await rosterService.list() };
      response.json(body);
    },

    add: async (request, response) => {
      const member = await rosterService.add(newMemberBody.parse(request.body));
      const body: RosterEntryResponse = { member };
      response.status(201).json(body);
    },

    invite: async (request, response) => {
      const { accountId } = accountIdParams.parse(request.params);
      const body: RosterEntryResponse = { member: await rosterService.invite(accountId) };
      response.status(201).json(body);
    },

    correct: async (request, response) => {
      const { accountId } = accountIdParams.parse(request.params);
      const member = await rosterService.correct(accountId, correctMemberBody.parse(request.body));
      const body: RosterEntryResponse = { member };
      response.json(body);
    },

    recordPayment: async (request, response) => {
      const { accountId } = accountIdParams.parse(request.params);
      const payment = paymentBody.parse(request.body);

      // Who recorded it, taken from the session rather than from the request — money is the one
      // place where "who says so" must not be something the request gets to claim. The stand-in
      // gate is a passphrase rather than a person, so it records nobody.
      const recordedBy = gate.whoIsSignedIn(response).account?.id ?? null;

      const member = await rosterService.recordPayment(accountId, payment, recordedBy);
      const body: RosterEntryResponse = { member };
      response.status(201).json(body);
    },
  };
}
