import { createHash, randomBytes } from 'node:crypto';

/**
 * The secret in an invitation or a reset link.
 *
 * **Only its hash is ever written down.** The token exists in the e-mail and in the member's
 * address bar; a copy of the database is not a way into anybody's account. A plain SHA-256 is
 * the right hash for exactly this and the wrong one for a password: there are 256 bits of
 * randomness in here and nothing to guess, so the slow hashing a password needs would buy
 * nothing and cost a lookup.
 */
export interface IssuedToken {
  /** What goes in the e-mail, and nowhere else. */
  token: string;
  /** What goes in the database. */
  tokenHash: string;
}

export function issueToken(): IssuedToken {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

/**
 * How long an invitation lasts.
 *
 * Long, because it has to survive a fortnight's holiday and a spam folder somebody checks on
 * Sundays — this is a club of enthusiasts, not a service with a support desk. It expires at all
 * (story 4) so that an e-mail forwarded or archived years ago is not a standing key to the
 * archive, and it is re-sendable (story 5) so that expiry is an inconvenience rather than a
 * telephone call.
 */
export const INVITATION_LIFETIME_MS = 21 * 24 * 60 * 60 * 1000;

/**
 * How long a password reset lasts. **Much shorter**, and the asymmetry is the point: an
 * invitation is expected and waited for, whereas a reset is a link that arrives in the middle of
 * somebody's afternoon because they asked for it a minute ago.
 */
export const PASSWORD_RESET_LIFETIME_MS = 2 * 60 * 60 * 1000;
