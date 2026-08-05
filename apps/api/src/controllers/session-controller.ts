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
 * **Two shapes, because there are two gates.** A member signs in with their address and their own
 * password; the passphrase is M1's shared Editor gate and leaves with ticket 15. A union rather
 * than one object with three optional fields, so a request carrying neither is refused with a
 * message rather than falling through to whichever branch was checked first.
 */
const signInBody = z.union([
  z.object({
    email: required('An e-mail address is required'),
    password: z.string().min(1, 'A password is required'),
  }),
  z.object({ passphrase: z.string().min(1, 'A passphrase is required') }),
]);

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
   * Sign this browser in, then answer with who it now is — including whether the Membership is
   * live, because **a lapsed member signs in successfully** and the screen has to know that it is
   * showing somebody who got in and cannot read (story 8).
   */
  async function admit(response: Response, subject: SessionSubject | null): Promise<void> {
    gate.signIn(response, { accountId: subject?.accountId ?? null, epoch: subject?.epoch ?? 0 });

    const who = subject === null ? null : await accountService.describe(subject.accountId);
    response.status(201).json(sessionOf(who));
  }

  return {
    read: async (request, response) => {
      const who = await gate.identify(request.headers.cookie);
      const body: SessionResponse =
        who === null ? { signedIn: false, account: null } : sessionOf(who);
      response.json(body);
    },

    signIn: async (request, response) => {
      const credentials: SignInRequest = signInBody.parse(request.body);

      if ('passphrase' in credentials) {
        // One message for a wrong passphrase and for a gate nobody configured. The second is a
        // deployment mistake rather than a secret, but telling the difference apart out loud is
        // how a stranger learns which of the two systems in front of them is worth guessing at.
        if (!gate.admitsPassphrase(credentials.passphrase)) {
          throw new NotSignedInError('That passphrase was not recognised.');
        }
        await admit(response, null);
        return;
      }

      await admit(response, await accountService.signIn(credentials));
    },

    signOut: (_request, response) => {
      gate.signOut(response);
      const body: SessionResponse = { signedIn: false, account: null };
      response.json(body);
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

/** The stand-in gate is signed in and is nobody, which is exactly what `account: null` says. */
function sessionOf(who: SignedIn | null): SessionResponse {
  if (who === null || who.account === null) {
    return { signedIn: true, account: null };
  }

  const account: SignedInAccount = {
    ...who.account,
    membershipIsLive: who.membershipIsLive,
    paidThrough: who.paidThrough,
  };
  return { signedIn: true, account };
}
