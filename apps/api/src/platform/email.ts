/**
 * The e-mail edge.
 *
 * One of the two external edges that are faked in tests. Invitations, password resets and
 * renewal reminders all leave through here, so it is the single place a test can assert that
 * exactly one reminder went out per membership term — and the single place a non-production
 * environment has to neutralise to be incapable of mailing a real member.
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
