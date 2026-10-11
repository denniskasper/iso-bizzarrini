import type {
  PasswordSetup,
  SessionResponse,
  SignedInAccount,
  SignInRequest,
} from '@ricambi/contracts';
import type { RequestHandler, Response } from 'express';
import { z } from 'zod';
import type { Gate, SignedIn } from '../access/gate.js';
import { NotSignedInError } from '../http/errors.js';
import type { AccountService, SessionSubject } from '../services/account-service.js';
import { required } from './fields.js';

/**
 * Signing in, signing out, and the two ways a password gets set.
 *
 * Every address here is open, and has to be: asking to be let in cannot require already being in.
 * What protects them is not a gate but their answers — one refusal for every way of failing, and
 * the same answer to "send me a reset link" whether or not the address is on the roster.
 */

/**
 * **One shape, because there is one gate.** A member signs in with the address the Club has for
 * them and the password they chose themselves; there is no other credential this archive accepts
 * (ticket 15).
 */
const signInBody = z.object({
  email: required('An e-mail address is required'),
  password: z.string().min(1, 'A password is required'),
});

const resetRequestBody = z.object({ email: required('An e-mail address is required') });
const inspectBody = z.object({ token: required('A link is required') });
const setupBody = z.object({
  token: required('A link is required'),
  password: z.string().min(1, 'A password is required'),
});

export interface SessionController {
  read: RequestHandler;
  signIn: RequestHandler;
  signOut: RequestHandler;
  requestPasswordReset: RequestHandler;
  inspectPasswordSetup: RequestHandler;
  setPassword: RequestHandler;
}

export function createSessionController(dependencies: {
  gate: Gate;
  accountService: AccountService;
}): SessionController {
  const { gate, accountService } = dependencies;

  /**
   * Answer with who this now is, and sign the browser in — including whether the Membership is
   * live, because **a lapsed member signs in successfully** and the screen has to know that it is
   * showing somebody who got in and cannot read (story 8).
   *
   * Read first and write the cookie second, in that order. The Account was read a moment ago to
   * let them in, so gone by now means somebody was taken off the roster between two queries —
   * and a browser sent home with a session cookie naming nobody is a browser carrying a
   * credential this archive will refuse for the next ninety days.
   */
  async function admit(response: Response, subject: SessionSubject): Promise<void> {
    const who = await accountService.describe(subject.accountId);
    if (who === null) {
      throw new NotSignedInError();
    }

    gate.signIn(response, subject);
    response.status(201).json(sessionOf(who));
  }

  return {
    read: async (request, response) => {
      const who = await gate.identify(request.headers.cookie);
      const body: SessionResponse = who === null ? SIGNED_OUT : sessionOf(who);
      response.json(body);
    },

    signIn: async (request, response) => {
      const credentials: SignInRequest = signInBody.parse(request.body);
      await admit(response, await accountService.signIn(credentials));
    },

    signOut: (_request, response) => {
      gate.signOut(response);
      response.json(SIGNED_OUT);
    },

    /**
     * **202 and no body, always.** Whether that address is on the roster is the one thing this
     * address must not say (story 7), and the surest way not to say it is to have nothing to say.
     */
    requestPasswordReset: async (request, response) => {
      const { email } = resetRequestBody.parse(request.body);
      await accountService.requestPasswordReset(email);
      response.status(202).end();
    },

    inspectPasswordSetup: async (request, response) => {
      const { token } = inspectBody.parse(request.body);
      const body: PasswordSetup = await accountService.inspectPasswordSetup(token);
      response.json(body);
    },

    /** Choosing the password, and being signed in by having chosen it. */
    setPassword: async (request, response) => {
      const setup = setupBody.parse(request.body);
      await admit(response, await accountService.redeemPasswordSetup(setup));
    },
  };
}

/** Nobody. Written once, because three addresses here answer it and they must agree. */
const SIGNED_OUT: SessionResponse = { signedIn: false, account: null };

/**
 * Signed in is always somebody: whether their Membership still lets them read is the *next*
 * question, and the whole point of keeping the two apart is that this answer carries both.
 */
function sessionOf(who: SignedIn): SessionResponse {
  const account: SignedInAccount = {
    ...who.account,
    membershipIsLive: who.membershipIsLive,
    paidThrough: who.paidThrough,
    graceUntil: who.graceUntil,
  };
  return { signedIn: true, account };
}
