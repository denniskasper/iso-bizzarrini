import type { AppConfig } from '../config/config.js';
import type { EmailSender } from '../platform/email.js';
import type { PaymentProvider } from '../platform/payments.js';
import type { ConfiguredReading } from './reading.js';

/**
 * What a non-production environment is not allowed to be able to do.
 *
 * The most common way a club leaks its own roster is a demo loaded from production, and the
 * most embarrassing failure available is a test system sending a real member a real demand for
 * money. Neither is prevented by remembering: they are prevented by an environment that will
 * not start.
 *
 * The check is on the *capability*, not on the configuration string that produced it. An edge
 * declares whether it can reach a real person or a real mandate, so a transport or a provider
 * added years from now is covered the moment it tells the truth about itself — nobody has to
 * come back here and add it to a list.
 */
export class EnvironmentSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentSafetyError';
  }
}

export function assertSafeForEnvironment(assembled: {
  config: AppConfig;
  emailSender: EmailSender;
  paymentProvider: PaymentProvider;
  /** Left out by the commands that read nothing; the application always hands it in. */
  reading?: ConfiguredReading;
}): void {
  const { config, emailSender, paymentProvider, reading } = assembled;

  if (config.environmentMode === 'production') {
    // `loadConfig` already refuses this outside development; a development process pointed at
    // the archive is the case left, and it must not open the archive to whoever reaches it.
    if (config.session.devSignInAs !== undefined) {
      throw new EnvironmentSafetyError(
        `"${config.environmentName}" is production and will not start with DEV_SIGN_IN_AS set. ` +
          'It signs in every request without a session. Unset it.',
      );
    }

    /**
     * **The one rule that points the other way**, and the thing that keeps a practice stack from
     * quietly becoming the archive by having a variable flipped.
     *
     * `log` writes the whole letter to the log instead of sending it, which is exactly right for
     * a laptop and for a preview: it is how somebody reads the invitation link back out. In
     * production it is two failures at once — every member invited waits for an e-mail that was
     * never sent, and the single-use secret in it is sitting in a log file that will be read,
     * shipped and backed up.
     *
     * `none` is left alone deliberately. It refuses to send, which is loud: the Administrator
     * gets a refusal naming both halves rather than silence. A nuisance is not a hazard.
     */
    if (config.email.transport === 'log') {
      throw new EnvironmentSafetyError(
        `"${config.environmentName}" is production and will not start with EMAIL_TRANSPORT=log. ` +
          'That writes invitations and password-reset links to the log rather than sending ' +
          'them — so no member ever receives one, and the secret in each is left in a log file. ' +
          'Configure a transport that can reach a real inbox.',
      );
    }

    // The fake Reading method invents what it reads (issue #55). In a practice system that is
    // the point; in the archive it would put Tavole nobody's catalog printed in front of an
    // Editor to publish.
    if (reading?.invented === true) {
      throw new EnvironmentSafetyError(
        `"${config.environmentName}" is production and will not start with READING_METHOD=fake. ` +
          'The fake method invents what it reads. Configure subscription or api-key, or none.',
      );
    }

    // An invitation carries a link, and a link needs a hostname. A production system that has
    // not been told its own is one that mails a hundred members a link to somebody's laptop —
    // discovered by the first member who cannot get in, days after the roster went out.
    if (namesNowhere(config.publicUrl)) {
      throw new EnvironmentSafetyError(
        `"${config.environmentName}" is production and PUBLIC_URL is ${config.publicUrl}. ` +
          'That is the address invitations and reset links point at. Set PUBLIC_URL to the ' +
          'hostname members actually reach.',
      );
    }
    return;
  }

  if (emailSender.reachesRealPeople) {
    throw new EnvironmentSafetyError(
      refusal(
        config,
        'its e-mail sender can put a message in front of a real person. ' +
          'Set EMAIL_TRANSPORT to a transport that captures or refuses.',
      ),
    );
  }

  if (paymentProvider.reachesRealMandates) {
    throw new EnvironmentSafetyError(
      refusal(
        config,
        `its payment provider ("${paymentProvider.name}") can reach a real mandate. ` +
          'Use test-mode keys here.',
      ),
    );
  }

  if (config.remindersEnabled) {
    throw new EnvironmentSafetyError(
      refusal(
        config,
        'renewal reminders are enabled. Reminders are production-only: a practice system ' +
          'must not be able to demand money from anyone. Unset REMINDERS_ENABLED.',
      ),
    );
  }
}

/**
 * The refusal pointing the other way: **only a system that has said it is practice may be
 * seeded.**
 *
 * Everything in the archive arrives by an Editor's hand or by a migration of the club's own
 * material (ADR 0005). A seeder exists to furnish a practice system with invented Models, and
 * the one thing it must never do is write them into the archive members read — or truncate what
 * is already there to make room for them.
 *
 * Note that this demands a *declared* mode, where the guards above are content with the default.
 * That asymmetry is deliberate. Deciding how to behave when nobody said anything should take the
 * cautious answer; emptying a table on the strength of nobody having said anything should not
 * happen at all. Silence is not permission, least of all in a checkout whose `DATABASE_URL` may
 * be pointed anywhere.
 */
export function assertSeedable(config: AppConfig): void {
  if (!config.environmentModeDeclared) {
    throw new EnvironmentSafetyError(
      `"${config.environmentName}" has not said which environment it is, and seeding empties ` +
        'every table before it writes. Set ENVIRONMENT_MODE=non-production on the system you ' +
        'mean to seed.',
    );
  }

  if (config.environmentMode === 'production') {
    throw new EnvironmentSafetyError(
      `"${config.environmentName}" is production and will not be seeded. Generated data belongs ` +
        'in a practice system; the archive is edited and migrated, never seeded.',
    );
  }
}

/** A URL that only resolves on the machine it was typed on. */
function namesNowhere(url: string): boolean {
  const { hostname } = new URL(url);
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function refusal(config: AppConfig, because: string): string {
  return (
    `"${config.environmentName}" is a non-production environment and will not start, because ${because}\n` +
    "If this really is the members' archive, set ENVIRONMENT_MODE=production — deliberately, " +
    'and once.'
  );
}
