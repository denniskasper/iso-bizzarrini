import type { ConnectionOptions } from 'node:tls';
import { createTransport } from 'nodemailer';
import type { EmailSender, OutboundEmail } from './email.js';

/**
 * Where the letters go, and in whose name. Everything here is read from the environment: the
 * provider is chosen by whoever operates the server, and choosing another is configuration.
 */
export interface SmtpSettings {
  host: string;
  port: number;
  /** TLS from the first byte (usually port 465). Otherwise the server must offer STARTTLS. */
  secure: boolean;
  user: string;
  password: string;
  from: { address: string; name: string };
}

/**
 * **The transport that delivers** (issue #16): a generic SMTP client, so the Club's provider can
 * be chosen and changed without a line of code.
 *
 * It declares that it reaches real people, because it does. That one fact is what makes a
 * non-production environment refuse to start with it (ADR 0012) and what makes renewal reminders
 * sendable in production at all.
 *
 * **The password never crosses the wire in the clear.** A connection that is not TLS from the
 * start must be upgraded with STARTTLS before anything is said, and a server that will not
 * upgrade is refused rather than logged in to.
 *
 * `tls` exists for the test seam alone, which talks to a server with a self-signed certificate.
 * Configuration has no way to set it.
 */
export class SmtpEmailSender implements EmailSender {
  readonly reachesRealPeople = true;
  readonly #transport;
  readonly #from: SmtpSettings['from'];

  constructor(settings: SmtpSettings, options: { tls?: ConnectionOptions } = {}) {
    this.#from = settings.from;
    this.#transport = createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      requireTLS: !settings.secure,
      auth: { user: settings.user, pass: settings.password },
      ...(options.tls === undefined ? {} : { tls: options.tls }),
    });
  }

  async send(email: OutboundEmail): Promise<void> {
    try {
      await this.#transport.sendMail({
        from: this.#from,
        to: email.to,
        ...(email.replyTo === undefined ? {} : { replyTo: email.replyTo }),
        subject: email.subject,
        text: email.text,
        ...(email.html === undefined ? {} : { html: email.html }),
      });
    } catch (error) {
      throw new EmailNotSentError(email.subject, error);
    }
  }
}

/**
 * A letter the SMTP server did not take.
 *
 * Thrown so that every path behaves as it does with any other refusal: an invitation answers 502
 * and the person stays on the roster, a reminder is un-marked and tried again.
 *
 * **The server's own words are not kept.** A refusal quotes the recipient back as often as not —
 * `550 <someone@example.org>: no such user` — and that sentence would go straight into the log.
 * What is kept is what a fault is found from: nodemailer's kind of failure (`EAUTH`,
 * `EENVELOPE`, `ESOCKET`…), the SMTP reply code, and the command it answered.
 */
export class EmailNotSentError extends Error {
  readonly code: string | undefined;

  constructor(subject: string, failure: unknown) {
    const { code, responseCode, command } = (failure ?? {}) as {
      code?: unknown;
      responseCode?: unknown;
      command?: unknown;
    };
    const reply = typeof responseCode === 'number' ? ` (${responseCode})` : '';
    const during = typeof command === 'string' ? ` answering ${command.split(' ')[0]}` : '';

    super(`The SMTP server did not take "${subject}"${reply}${during}.`);
    this.name = 'EmailNotSentError';
    this.code = typeof code === 'string' ? code : undefined;
  }
}
