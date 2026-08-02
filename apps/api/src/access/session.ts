import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The stand-in Editor gate: **one shared passphrase, and a signed cookie to remember it by.**
 *
 * This is the whole of M1's "single hard-coded admin login". It exists for one reason — the
 * scanned drawings are the Club's, and members contribute on the understanding that only
 * paid-up members see them (ADR 0006), so the scans could not sit on an open route while
 * ticket 14 builds the real gate. It is not a login system and does not pretend to be: there
 * is no Account, no Membership, no expiry, no reset and no rate limit, all of which arrive
 * with the roster. `assertSafeForEnvironment` refuses to let it start in production.
 *
 * There is no server-side session store. The cookie carries its own expiry and an HMAC over
 * it, so a restart with a fixed `SESSION_SECRET` keeps everyone signed in and a restart
 * without one signs everyone out — which is the right behaviour for a laptop and obvious
 * enough in a deployment.
 */
export const SESSION_COOKIE_NAME = 'ricambi_editor';

/**
 * How long a signed-in Editor stays signed in. Long, because this is used standing at a bench
 * with a scanner, and short of the ~90 days the spec gives real members — the shared-passphrase
 * gate should not outlive the ticket that replaces it.
 */
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionSigner {
  /** A token that says "signed in as an Editor", valid until `now` + `SESSION_DURATION_MS`. */
  issue(now: Date): { token: string; expiresAt: Date };
  /** Whether a token was issued by us and has not expired. Never throws on rubbish input. */
  verify(token: string | undefined, now: Date): boolean;
}

export function createSessionSigner(secret: string | undefined): SessionSigner {
  // No default and no derivation from anything guessable: an unset secret is a fresh random
  // one, so the failure mode is "signed out after a restart" rather than "forgeable cookie".
  const key = secret ?? randomBytes(32).toString('hex');

  return {
    issue(now) {
      const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
      const payload = encode(String(expiresAt.getTime()));
      return { token: `${payload}.${sign(key, payload)}`, expiresAt };
    },

    verify(token, now) {
      if (token === undefined) {
        return false;
      }

      const separator = token.lastIndexOf('.');
      if (separator <= 0) {
        return false;
      }

      const payload = token.slice(0, separator);
      if (!matches(token.slice(separator + 1), sign(key, payload))) {
        return false;
      }

      const expiresAt = Number(decode(payload));
      return Number.isFinite(expiresAt) && expiresAt > now.getTime();
    },
  };
}

/**
 * Whether an offered passphrase is the configured one.
 *
 * Compared through a digest rather than directly, so the comparison takes the same time
 * whatever was offered — a length-sensitive `===` on a shared passphrase is a needless gift.
 * An unconfigured gate refuses everything, including an empty offer.
 */
export function passphraseMatches(configured: string | undefined, offered: string): boolean {
  if (configured === undefined) {
    return false;
  }
  return matches(digest(offered), digest(configured));
}

/** Reads one cookie out of a `Cookie` header. Express does not parse them and we need one. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) {
    return undefined;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }

  return undefined;
}

function sign(key: string, payload: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

function digest(value: string): Buffer {
  return createHmac('sha256', 'ricambi.passphrase').update(value).digest();
}

function matches(offered: string | Buffer, expected: string | Buffer): boolean {
  const a = Buffer.isBuffer(offered) ? offered : Buffer.from(offered);
  const b = Buffer.isBuffer(expected) ? expected : Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function encode(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString();
}
