import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The session cookie: **who this browser is, and an HMAC so it cannot say otherwise.**
 *
 * There is deliberately no server-side session store. The cookie carries the Account it names,
 * which generation of that Account's sessions it belongs to and when it stops being good, plus a
 * signature over all three; a restart with a fixed `SESSION_SECRET` keeps everyone signed in and
 * a restart without one signs everyone out — right for a laptop, obvious in a deployment.
 *
 * Storelessness costs one thing, and it is bought back rather than accepted: a cookie cannot be
 * torn up from this end. So a **generation number** travels in it, and the Account carries the
 * generation that is still good. Setting a password bumps it, so the browser doing the setting
 * gets the new number and every other one stops working at its next request — which is what
 * somebody resetting a password because of a shared computer came here to do.
 *
 * A counter rather than a timestamp, deliberately. The session being issued and the sessions
 * being killed happen in the same instant, and an instant cannot tell them apart.
 */
export const SESSION_COOKIE_NAME = 'ricambi_session';

/**
 * How long a member stays signed in. **Ninety days**, because this is read standing in a cold
 * garage on a phone (story 14), and somebody who visits twice a year should not be typing a
 * password on both visits. What makes that safe is not a smaller number: it is that signing out
 * is explicit and one press away (story 15), that a lapsed Membership ends access at the next
 * request regardless, and that a reset kills every session the moment it is used.
 */
export const SESSION_DURATION_MS = 90 * 24 * 60 * 60 * 1000;

/** Who a cookie says this browser is. */
export interface SessionClaim {
  /**
   * The Account this session names, or null for the **stand-in Editor gate** — one shared
   * passphrase, which is a credential rather than a person. Ticket 15 removes the null case.
   */
  accountId: string | null;
  /** Which generation of this Account's sessions it belongs to. Zero for the stand-in gate. */
  epoch: number;
}

export interface SessionSigner {
  issue(claim: SessionClaim, now: Date): { token: string; expiresAt: Date };
  /**
   * What a token claims, or null if we did not issue it or it has expired. Never throws on
   * rubbish input — every cookie in the world arrives here eventually.
   */
  read(token: string | undefined, now: Date): SessionClaim | null;
}

interface Payload {
  sub: string | null;
  gen: number;
  exp: number;
}

export function createSessionSigner(secret: string | undefined): SessionSigner {
  // No default and no derivation from anything guessable: an unset secret is a fresh random
  // one, so the failure mode is "signed out after a restart" rather than "forgeable cookie".
  const key = secret ?? randomBytes(32).toString('hex');

  return {
    issue(claim, now) {
      const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
      const payload = encode({
        sub: claim.accountId,
        gen: claim.epoch,
        exp: expiresAt.getTime(),
      });

      return { token: `${payload}.${sign(key, payload)}`, expiresAt };
    },

    read(token, now) {
      if (token === undefined) {
        return null;
      }

      const separator = token.lastIndexOf('.');
      if (separator <= 0) {
        return null;
      }

      const payload = token.slice(0, separator);
      // The signature first, always. Nothing below this line has read anything a stranger wrote.
      if (!matches(token.slice(separator + 1), sign(key, payload))) {
        return null;
      }

      const claim = decode(payload);
      if (claim === null || claim.exp <= now.getTime()) {
        return null;
      }

      return { accountId: claim.sub, epoch: claim.gen };
    },
  };
}

/**
 * Whether an offered passphrase is the configured one — the **stand-in Editor gate**, which is
 * the whole of M1's "single hard-coded admin login" and which ticket 15 removes.
 *
 * Compared through a digest rather than directly, so the comparison takes the same time whatever
 * was offered — a length-sensitive `===` on a shared passphrase is a needless gift. An
 * unconfigured gate refuses everything, including an empty offer.
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

function encode(payload: Payload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decode(value: string): Payload | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const { sub, gen, exp } = parsed as Partial<Payload>;
    const namesSomebody = typeof sub === 'string' || sub === null;
    if (!namesSomebody || typeof gen !== 'number' || typeof exp !== 'number') {
      return null;
    }
    if (!Number.isFinite(gen) || !Number.isFinite(exp)) {
      return null;
    }

    return { sub: sub ?? null, gen, exp };
  } catch {
    return null;
  }
}
