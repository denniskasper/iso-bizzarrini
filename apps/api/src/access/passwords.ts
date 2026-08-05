import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { promisify } from 'node:util';
import { ValidationError } from '../http/errors.js';

// `promisify` resolves to the overload without options, which is the one this cannot use.
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Passwords: what the archive will accept, and how it stores what it accepted.
 *
 * The rules are ADR 0003's, and every one of them is a deliberate *absence* as much as a
 * presence — **ten characters, no composition rules, no rotation, no expiry**. This membership
 * signs in a couple of times a year, and a rule that makes them increment a digit or write a
 * password on a card is a rule that has made the archive less safe rather than more.
 */
export const MINIMUM_PASSWORD_LENGTH = 10;

/**
 * A ceiling, which is not a rule about passwords so much as a rule about request bodies: hashing
 * is deliberately expensive, and there is no reason to pay for it over a megabyte of paste. It is
 * far above anything a password manager generates, so nobody meets it by choosing well.
 */
export const MAXIMUM_PASSWORD_LENGTH = 256;

/**
 * How hard a password is to store. Higher is slower for everybody, including whoever stole the
 * table — the whole point of the parameter.
 *
 * The default is OWASP's first recommendation for scrypt, and it costs about a third of a second
 * on the hardware this runs on. That is affordable here in a way it would not be everywhere: this
 * is a hundred people signing in a couple of times a year, not a login page under load.
 *
 * Tests run it far cheaper, and deliberately still run *it* — the same function, the same
 * encoding, the same verification path — because a suite that swapped the hasher for a fake would
 * stop proving that what is written can be read back.
 */
export interface ScryptCost {
  /** CPU and memory cost. A power of two. */
  N: number;
  /** Block size. */
  r: number;
  /** Parallelisation. */
  p: number;
}

export const STANDARD_COST: ScryptCost = { N: 2 ** 17, r: 8, p: 1 };

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export interface PasswordHasher {
  /** Refuses anything the rules above do not allow, then stores it so it cannot be read back. */
  hash(password: string): Promise<string>;
  /**
   * Whether this password produces what was stored. Never throws on rubbish input — a stored
   * value this cannot parse is a "no", because the alternative is a 500 on the sign-in route.
   */
  verify(password: string, stored: string): Promise<boolean>;
}

/**
 * **The parameters travel inside the stored string**, which is what lets the cost be raised years
 * from now without invalidating a single password: an old hash still says how to check itself.
 * The format is `scrypt$N$r$p$salt$key`, all base64url.
 */
export function createPasswordHasher(cost: ScryptCost = STANDARD_COST): PasswordHasher {
  return {
    async hash(password) {
      assertPasswordIsAllowed(password);
      const salt = randomBytes(SALT_LENGTH);
      const key = await derive(password, salt, cost);
      return ['scrypt', cost.N, cost.r, cost.p, salt.toString('base64url'), key].join('$');
    },

    async verify(password, stored) {
      const parts = stored.split('$');
      if (parts.length !== 6 || parts[0] !== 'scrypt') {
        return false;
      }

      const [, n, r, p, salt, expected] = parts as [string, string, string, string, string, string];
      const parameters = { N: Number(n), r: Number(r), p: Number(p) };
      if (!Object.values(parameters).every((value) => Number.isInteger(value) && value > 0)) {
        return false;
      }
      // Not the configured length: what was stored decides, so a key length changed later still
      // verifies what was written before it.
      const expectedKey = Buffer.from(expected, 'base64url');
      if (expectedKey.length === 0 || password.length > MAXIMUM_PASSWORD_LENGTH) {
        return false;
      }

      const offered = Buffer.from(
        await derive(password, Buffer.from(salt, 'base64url'), parameters, expectedKey.length),
        'base64url',
      );

      return offered.length === expectedKey.length && timingSafeEqual(offered, expectedKey);
    },
  };
}

/**
 * The rules, in one place and stated as refusals a member reads.
 *
 * Note what is *not* here: no upper case, no digit, no symbol, no forbidden dictionary of the
 * Club's own devising. A passphrase of four plain words is a good password and every composition
 * rule ever written refuses it.
 */
export function assertPasswordIsAllowed(password: string): void {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new ValidationError(
      `A password needs at least ${MINIMUM_PASSWORD_LENGTH} characters. ` +
        'There are no other rules — four ordinary words are a good password.',
    );
  }
  if (password.length > MAXIMUM_PASSWORD_LENGTH) {
    throw new ValidationError(`A password may be at most ${MAXIMUM_PASSWORD_LENGTH} characters.`);
  }
}

async function derive(
  password: string,
  salt: Buffer,
  cost: ScryptCost,
  keyLength: number = KEY_LENGTH,
): Promise<string> {
  // Node's default `maxmem` is 32 MB, which the recommended cost exceeds — so scrypt would
  // refuse the very parameters it is being asked for. The bound is the requirement plus room.
  const needed = 128 * cost.N * cost.r;
  const key = await scrypt(password, salt, keyLength, { ...cost, maxmem: needed * 2 });

  return key.toString('base64url');
}
