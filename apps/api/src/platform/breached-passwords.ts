import { createHash } from 'node:crypto';
import type { Logger } from './logger.js';

/**
 * The third external edge, alongside the e-mail sender and the payment provider: **somebody
 * else's list of passwords that have already been stolen.**
 *
 * ADR 0003 dropped forced rotation and put this in its place. Rotation asked every member to
 * change a password that was probably fine; this asks nobody to change anything, and refuses the
 * handful that are already in a criminal's dictionary. It is the one password rule that is about
 * the password rather than about its shape.
 *
 * It is an interface for the same reason the other two are: a test seam must not depend on a
 * third party being up, and the archive must not be able to reach one from a practice system by
 * accident.
 */
export interface BreachedPasswordCheck {
  /** Named in the log line when a check could not be made. */
  readonly name: string;
  /** Whether this password appears in a known breach. */
  isBreached(password: string): Promise<boolean>;
}

/**
 * No check at all — every password passes.
 *
 * This is the honest default for a laptop and for the browser suite, and it is deliberately
 * **not** the default in configuration: `BREACHED_PASSWORD_CHECK` defaults to the real thing, so
 * a deployment gets the check without anyone remembering to ask for it, and a developer who wants
 * to work on a train opts out in writing.
 */
export class UncheckedPasswords implements BreachedPasswordCheck {
  readonly name = 'no breached-password check';

  async isBreached(): Promise<boolean> {
    return false;
  }
}

/** How long to wait for somebody else's service before giving up and letting the password past. */
const TIMEOUT_MS = 3_000;

/**
 * The k-anonymity range API: **the password never leaves this process, and neither does its
 * hash.**
 *
 * What goes over the wire is the first five hex characters of the SHA-1, which names a bucket of
 * some hundreds of hashes; the answer is that whole bucket, and the comparison happens here. The
 * service therefore cannot learn which password was asked about, and does not have to be trusted
 * with it — which is why an archive that will not send a stack trace to a third party (ADR 0011)
 * is content to send this.
 *
 * **It fails open, on purpose.** If the service is slow, down, or unreachable from behind a
 * firewall, a member setting a password gets their password set. The alternative is that somebody
 * else's outage stops the Club inviting anybody, which is a worse failure than accepting one
 * password that would have been refused. The gap is logged rather than swallowed.
 */
export class RangeApiBreachedPasswords implements BreachedPasswordCheck {
  readonly name = 'the Pwned Passwords range API';
  readonly #logger: Logger;
  readonly #endpoint: string;

  constructor(dependencies: { logger: Logger; endpoint?: string }) {
    this.#logger = dependencies.logger;
    this.#endpoint = dependencies.endpoint ?? 'https://api.pwnedpasswords.com/range';
  }

  async isBreached(password: string): Promise<boolean> {
    const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);

    let listing: string;
    try {
      const response = await fetch(`${this.#endpoint}/${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`answered ${response.status}`);
      }
      listing = await response.text();
    } catch (error) {
      this.#logger.warn(
        { err: error },
        `Could not reach ${this.name}; this password was not checked against known breaches.`,
      );
      return false;
    }

    // `SUFFIX:count` a line. A padded response carries decoys with a count of zero, which are
    // exactly what the comparison must not match — so the count is read rather than ignored.
    for (const line of listing.split('\n')) {
      const [candidate = '', count = '0'] = line.trim().split(':');
      if (candidate.toUpperCase() === suffix && Number(count) > 0) {
        return true;
      }
    }

    return false;
  }
}
