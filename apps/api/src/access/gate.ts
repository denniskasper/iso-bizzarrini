import type { Role } from '@ricambi/contracts';
import type { CookieOptions, RequestHandler, Response } from 'express';
import type { AppConfig } from '../config/config.js';
import { ForbiddenError, MembershipLapsedError, NotSignedInError } from '../http/errors.js';
import type { Clock } from '../platform/clock.js';
import {
  createSessionSigner,
  readCookie,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  type SessionClaim,
  type SessionSigner,
} from './session.js';

/**
 * The gate in front of the archive, and in front of administering the Club.
 *
 * One object rather than several loose middlewares, because the cookie's name, its flags, its
 * signing key and what it admits have to agree with each other, and the way they stop agreeing is
 * by being written down in four places.
 *
 * **There are two questions here and they are deliberately separate.** *Authenticate* asks who
 * this is; *authorise* asks what they may do. A member who cannot prove who they are is told
 * nothing at all, because the sign-in form must never reveal who is on the roster (story 7). A
 * member who has proved it can be told exactly what is wrong, because they have proved it.
 */
export interface SignedIn {
  /**
   * **Always a person.** There was once a second kind of session — one shared passphrase, which
   * was a credential rather than anybody — and ticket 15 removed it, along with every `account
   * === null` branch that had to keep asking whether a request had a name behind it. What puts
   * the first Administrator on an empty roster now is `composition/first-administrator.ts`.
   */
  account: { id: string; name: string; email: string; role: Role };
  /** Whether they may read: a Paid-through that has not passed, or grace past it (issue #17). */
  membershipIsLive: boolean;
  /** ISO date — the last day of grace, while they are reading on it. Null otherwise. */
  graceUntil: string | null;
  /** ISO date — the furthest term's last day. Null where no term was ever recorded. */
  paidThrough: string | null;
}

/**
 * What the gate needs from the rest of the application to turn an Account id into a person. The
 * account service implements it; declared here so the gate depends on the question rather than
 * on the service that happens to answer it.
 */
export interface SignedInReader {
  identify(accountId: string, epoch: number): Promise<SignedIn | null>;
}

export interface Gate {
  /** Refuses unless a valid session came with the request. Says nothing about what it may do. */
  requireSignedIn: RequestHandler;
  /**
   * Refuses unless the signed-in person's Membership is live. **This is what the archive is
   * behind**, and it is asked on every request, so a lapse takes effect immediately including
   * mid-session — the rule the Club states is the rule that applies (story 20).
   */
  requireLiveMembership: RequestHandler;
  /** Editors and Administrators. */
  requireEditor: RequestHandler;
  /**
   * Administrators. Deliberately **not** behind `requireLiveMembership`: administering the Club
   * is not reading the archive, and an Administrator who forgot to pay their own Membership
   * must not be locked out of the one screen that can record the payment.
   */
  requireAdministrator: RequestHandler;
  /** Who this request is, or null. Reads the cookie; makes no promises about what they may do. */
  identify(cookieHeader: string | undefined): Promise<SignedIn | null>;
  /** Who a handler behind one of the `require` middlewares is serving. */
  whoIsSignedIn(response: Response): SignedIn;
  /**
   * Whether this person is an Editor or an Administrator — the question `requireEditor` asks,
   * for the one handler whose *answer* depends on it rather than whether it answers at all.
   */
  mayEdit(who: SignedIn): boolean;
  /**
   * Whether the person a handler is serving is shown Unchecked Tavole (ADR 0017). The same
   * answer as `mayEdit`, asked of the request: what a list holds depends on who reads it.
   */
  seesUnchecked(response: Response): boolean;
  signIn(response: Response, claim: SessionClaim): void;
  signOut(response: Response): void;
}

/**
 * Where the answer is parked between the middleware that found it and the handler that reads it.
 * On `response.locals` rather than on the request, because that is the bag Express provides for
 * exactly this and it is thrown away with the response.
 */
const SIGNED_IN = 'ricambi.signedIn';

export function createGate(dependencies: {
  config: AppConfig;
  clock: Clock;
  accounts: SignedInReader;
}): Gate {
  const { config, clock, accounts } = dependencies;
  const signer: SessionSigner = createSessionSigner(config.session.secret);

  async function identify(cookieHeader: string | undefined): Promise<SignedIn | null> {
    const claim = signer.read(readCookie(cookieHeader, SESSION_COOKIE_NAME), clock.now());
    if (claim === null) {
      return null;
    }

    return accounts.identify(claim.accountId, claim.epoch);
  }

  /**
   * Every `require` is this: identify once, park the answer, then ask one question of it. The
   * middlewares stack, so a route behind `requireLiveMembership` alone still identifies — there
   * is no order they have to be written in.
   */
  function requiring(allows: (who: SignedIn) => void): RequestHandler {
    return (request, response, next) => {
      void (async () => {
        try {
          const who = (response.locals[SIGNED_IN] as SignedIn | undefined) ?? undefined;
          const signedIn = who ?? (await identify(request.headers.cookie));
          if (signedIn === null) {
            next(new NotSignedInError());
            return;
          }

          response.locals[SIGNED_IN] = signedIn;
          allows(signedIn);
          next();
        } catch (error) {
          next(error);
        }
      })();
    };
  }

  const mayEdit = new Set<Role>(['editor', 'administrator']);

  function whoIsSignedIn(response: Response): SignedIn {
    const who = response.locals[SIGNED_IN] as SignedIn | undefined;
    if (who === undefined) {
      // A handler asking this from outside the gate is a wiring mistake rather than a refusal,
      // and it should read like one instead of arriving at a member as a 401.
      throw new Error('Nothing has identified this request. Put it behind the gate.');
    }
    return who;
  }

  return {
    identify,

    requireSignedIn: requiring(() => {}),

    requireLiveMembership: requiring((who) => {
      if (!who.membershipIsLive) {
        throw new MembershipLapsedError(who.paidThrough);
      }
    }),

    mayEdit: (who) => mayEdit.has(who.account.role),

    requireEditor: requiring((who) => {
      if (!mayEdit.has(who.account.role)) {
        throw new ForbiddenError('Editing the archive is an Editor’s job.');
      }
    }),

    requireAdministrator: requiring((who) => {
      if (who.account.role !== 'administrator') {
        throw new ForbiddenError('The roster is an Administrator’s to keep.');
      }
    }),

    seesUnchecked(response) {
      return mayEdit.has(whoIsSignedIn(response).account.role);
    },

    whoIsSignedIn,

    signIn(response, claim) {
      // `maxAge` rather than an absolute `expires`: the attribute is read against the browser's
      // clock, and ours is injected. What actually decides whether a session is still good is
      // the expiry inside the signed token, which is checked against the clock we were handed.
      const { token } = signer.issue(claim, clock.now());
      response.cookie(SESSION_COOKIE_NAME, token, {
        ...cookieOptions(response),
        maxAge: SESSION_DURATION_MS,
      });
    },

    signOut(response) {
      response.clearCookie(SESSION_COOKIE_NAME, cookieOptions(response));
    },
  };
}

/**
 * `secure` follows the connection rather than a configuration flag: the deployment terminates
 * TLS at Traefik and `trust proxy` is set, so `request.secure` is the truth, and a laptop on
 * plain http still gets a working cookie without anyone having to remember a switch.
 *
 * `sameSite: 'lax'` because a shared deep link into the archive is a plain navigation and must
 * survive arriving from someone's e-mail (story 52).
 *
 * The cookie is scoped to this host by saying nothing about a domain — which is the whole of
 * "the public club site never receives it": a `Domain` attribute is what would widen it, and
 * Ricambi is on its own subdomain (ADR 0009) precisely so that nothing has to.
 */
function cookieOptions(response: Response): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: response.req.secure,
    path: '/',
  };
}
