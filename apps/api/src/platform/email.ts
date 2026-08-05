import type { Logger } from './logger.js';

/**
 * The e-mail edge.
 *
 * One of the external edges that are faked in tests. Invitations, password resets and renewal
 * reminders all leave through here, so it is the single place a test can assert that exactly one
 * reminder went out per membership term — and the single place a non-production environment has
 * to neutralise to be incapable of mailing a real member.
 */
export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSender {
  /**
   * Whether anything sent through this can actually land in someone's inbox. Declared by the
   * sender rather than inferred from configuration, because it is the one fact a non-production
   * environment refuses to start with — see `composition/environment-safety.ts`. A transport
   * that delivers must say so.
   */
  readonly reachesRealPeople: boolean;
  send(email: OutboundEmail): Promise<void>;
}

/** Captures everything sent, for tests and for a non-production mailbox nobody can reach. */
export class InMemoryEmailSender implements EmailSender {
  readonly reachesRealPeople = false;
  readonly #sent: OutboundEmail[] = [];

  async send(email: OutboundEmail): Promise<void> {
    this.#sent.push({ ...email });
  }

  get sent(): readonly OutboundEmail[] {
    return this.#sent;
  }

  sentTo(recipient: string): readonly OutboundEmail[] {
    return this.#sent.filter((email) => email.to === recipient);
  }

  clear(): void {
    this.#sent.length = 0;
  }
}

/**
 * **The laptop's mail catcher**: every letter written to the log, in full.
 *
 * An invitation is a link, and a developer working on the roster has to be able to click it.
 * This is the smallest thing that makes that true — no container, no port, no inbox — and the
 * letter is printed whole rather than summarised, because the point of it *is* the link.
 *
 * Never in production. It reaches nobody, so `assertSafeForEnvironment` is content with it in a
 * practice system; what stops it being used for real is that it delivers to a terminal.
 */
export class LoggedEmailSender implements EmailSender {
  readonly reachesRealPeople = false;
  readonly #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  async send(email: OutboundEmail): Promise<void> {
    this.#logger.info(
      { to: email.to, subject: email.subject },
      `\n──────── e-mail to ${email.to} ────────\n${email.subject}\n\n${email.text}\n────────`,
    );
  }
}

/**
 * Refuses to send. The default until a real provider is wired in, so a misconfigured
 * environment fails loudly rather than silently dropping an invitation.
 */
export class UnconfiguredEmailSender implements EmailSender {
  readonly reachesRealPeople = false;

  async send(email: OutboundEmail): Promise<void> {
    throw new Error(
      `No e-mail transport is configured; refusing to send "${email.subject}". ` +
        'Set EMAIL_TRANSPORT for this environment.',
    );
  }
}
