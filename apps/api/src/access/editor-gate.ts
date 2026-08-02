import type { CookieOptions, RequestHandler, Response } from 'express';
import type { AppConfig } from '../config/config.js';
import { NotSignedInError } from '../http/errors.js';
import type { Clock } from '../platform/clock.js';
import {
  createSessionSigner,
  passphraseMatches,
  readCookie,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  type SessionSigner,
} from './session.js';

/**
 * The gate in front of everything an Editor may do and everything the Club's scans live behind.
 *
 * One object rather than three loose middlewares, because the cookie's name, its flags, its
 * signing key and the passphrase have to agree with each other, and the way they stop agreeing
 * is by being written down in four places.
 */
export interface EditorGate {
  /** Refuses the request unless a valid session cookie came with it. */
  requireEditor: RequestHandler;
  /** Whether this request carries a valid session. */
  isSignedIn(cookieHeader: string | undefined): boolean;
  /** Whether an offered passphrase opens the gate. Always false when none is configured. */
  admits(passphrase: string): boolean;
  signIn(response: Response): void;
  signOut(response: Response): void;
}

export function createEditorGate(dependencies: { config: AppConfig; clock: Clock }): EditorGate {
  const { config, clock } = dependencies;
  const signer: SessionSigner = createSessionSigner(config.editorGate.sessionSecret);

  const isSignedIn = (cookieHeader: string | undefined): boolean =>
    signer.verify(readCookie(cookieHeader, SESSION_COOKIE_NAME), clock.now());

  return {
    isSignedIn,

    admits: (passphrase) => passphraseMatches(config.editorGate.password, passphrase),

    requireEditor(request, _response, next) {
      next(isSignedIn(request.headers.cookie) ? undefined : new NotSignedInError());
    },

    signIn(response) {
      // `maxAge` rather than an absolute `expires`: the attribute is read against the browser's
      // clock, and ours is injected. What actually decides whether a session is still good is
      // the expiry inside the signed token, which is checked against the clock we were handed.
      const { token } = signer.issue(clock.now());
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
 * TLS at Caddy and `trust proxy` is set, so `request.secure` is the truth, and a laptop on
 * plain http still gets a working cookie without anyone having to remember a switch.
 *
 * `sameSite: 'lax'` because a shared deep link into the archive is a plain navigation and must
 * survive arriving from someone's e-mail (story 52).
 */
function cookieOptions(response: Response): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: response.req.secure,
    path: '/',
  };
}
