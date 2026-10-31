import { describe, expect, it } from 'vitest';
import {
  assertSafeForEnvironment,
  assertSeedable,
  EnvironmentSafetyError,
} from '../src/composition/environment-safety.js';
import { configureReading } from '../src/composition/reading.js';
import { loadConfig, type AppConfig } from '../src/config/config.js';
import { InMemoryEmailSender, type EmailSender } from '../src/platform/email.js';
import {
  UnconfiguredPaymentProvider,
  type PaymentEvent,
  type PaymentProvider,
} from '../src/platform/payments.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * What makes the non-production environment safe: it refuses to start at all if it has been
 * handed the means to reach a real member or a real mandate.
 *
 * These are tested by trying to start the application rather than by driving a request, because
 * starting is the only moment they happen. An environment that could mail the membership never
 * gets as far as answering anything — which is the entire point, and is why the check lives
 * where the edges are assembled rather than where they are used.
 */

function configFor(overrides: Record<string, string>): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    ENVIRONMENT_NAME: 'test',
    DATABASE_URL: 'postgres://unused-in-tests/the-connection-is-injected',
    ...overrides,
  });
}

/** Stands in for the SMTP sender of ticket 14: it says it can put mail in front of a person. */
const senderThatReachesMembers: EmailSender = {
  reachesRealPeople: true,
  async send() {
    throw new Error('This sender exists to be refused, not to send.');
  },
};

/** Stands in for Stripe with a live key: it says it can move real money. */
const providerThatReachesRealMandates: PaymentProvider = {
  name: 'live-provider-stand-in',
  reachesRealMandates: true,
  takesPayments: true,
  signatureHeader: 'provider-signature',
  async startSubscription() {
    throw new Error('This provider exists to be refused, not to be used.');
  },
  async setAutoRenewal() {
    throw new Error('This provider exists to be refused, not to be used.');
  },
  async endSubscription() {
    throw new Error('This provider exists to be refused, not to be used.');
  },
  async receiptUrlFor() {
    throw new Error('This provider exists to be refused, not to be used.');
  },
  readWebhookEvent(): PaymentEvent {
    throw new Error('This provider exists to be refused, not to be used.');
  },
};

describe('a non-production environment', () => {
  it('refuses to start with an e-mail sender that can reach a real person', async () => {
    await expect(startTestApp({ emailSender: senderThatReachesMembers })).rejects.toThrow(
      /e-mail|mail/i,
    );
  });

  it('refuses to start with a payment provider that can reach a real mandate', async () => {
    await expect(
      startTestApp({ paymentProvider: providerThatReachesRealMandates }),
    ).rejects.toThrow(/mandate/i);
  });

  it('refuses to start with renewal reminders enabled, so nobody can switch them on here', async () => {
    await expect(startTestApp({ env: { REMINDERS_ENABLED: 'true' } })).rejects.toThrow(/reminder/i);
  });
});

describe('generated seed data', () => {
  it('refuses to be written into production, which is edited rather than seeded', () => {
    expect(() => assertSeedable(configFor({ ENVIRONMENT_MODE: 'production' }))).toThrow(
      EnvironmentSafetyError,
    );
  });

  it('refuses an environment that has not said which it is, because seeding empties tables first', () => {
    expect(() => assertSeedable(configFor({}))).toThrow(EnvironmentSafetyError);
  });

  it('is welcome where a system has declared itself practice', () => {
    expect(() => assertSeedable(configFor({ ENVIRONMENT_MODE: 'non-production' }))).not.toThrow();
  });
});

/**
 * **The one refusal that points the other way**, and the thing that stops a practice stack
 * becoming the archive by having `ENVIRONMENT_MODE` flipped.
 *
 * `log` writes the whole letter to the log instead of sending it, which is how an operator reads
 * an invitation link back out of a laptop or a preview. In production it is two failures at once:
 * every member invited waits for an e-mail that was never sent, and the single-use secret in each
 * is left in a log file that gets read, shipped and backed up.
 */
describe('production and an e-mail transport that sends nothing', () => {
  function assertSafe(overrides: Record<string, string>): void {
    assertSafeForEnvironment({
      config: configFor({
        ENVIRONMENT_MODE: 'production',
        PUBLIC_URL: 'https://ricambi.example',
        ...overrides,
      }),
      emailSender: new InMemoryEmailSender(),
      paymentProvider: new UnconfiguredPaymentProvider(),
    });
  }

  it('refuses to start while invitations would be written to the log', () => {
    expect(() => assertSafe({ EMAIL_TRANSPORT: 'log' })).toThrow(/EMAIL_TRANSPORT=log/);
  });

  /** A nuisance is not a hazard: `none` refuses to send, and it refuses out loud. */
  it('is content with a transport that refuses, because a refusal is not a silence', () => {
    expect(() => assertSafe({ EMAIL_TRANSPORT: 'none' })).not.toThrow();
  });

  /** The preview stack is exactly this configuration, which is what makes it unpromotable. */
  it('leaves a practice system free to write its mail wherever it likes', () => {
    expect(() =>
      assertSafeForEnvironment({
        config: configFor({ ENVIRONMENT_MODE: 'non-production', EMAIL_TRANSPORT: 'log' }),
        emailSender: new InMemoryEmailSender(),
        paymentProvider: new UnconfiguredPaymentProvider(),
      }),
    ).not.toThrow();
  });
});

/**
 * **The fake Reading method invents what it reads** (issue #55), which is what a practice system
 * and a test want and the one thing the archive must never publish from. So production refuses
 * it, the way it refuses a transport that writes letters to the log.
 */
describe('production and the fake Reading method', () => {
  function assertSafe(overrides: Record<string, string>): void {
    const config = configFor({
      ENVIRONMENT_MODE: 'production',
      PUBLIC_URL: 'https://ricambi.example',
      ...overrides,
    });
    assertSafeForEnvironment({
      config,
      emailSender: new InMemoryEmailSender(),
      paymentProvider: new UnconfiguredPaymentProvider(),
      reading: configureReading(config.reading),
    });
  }

  it('refuses to start with the fake method', () => {
    expect(() => assertSafe({ READING_METHOD: 'fake' })).toThrow(/READING_METHOD=fake/);
  });

  it('starts with a method that really reads, or with none', () => {
    expect(() =>
      assertSafe({ READING_METHOD: 'api-key', ANTHROPIC_API_KEY: 'sk-ant-api03-made-up' }),
    ).not.toThrow();
    expect(() => assertSafe({})).not.toThrow();
  });

  it('leaves a practice system free to read with it', async () => {
    const app = await startTestApp({ env: { READING_METHOD: 'fake' } });
    await app.close();
  });
});

/**
 * **Proposals run the other way** (ADR 0012, as amended; issue #152): the conversation is for
 * practice systems, and Production refuses its credential rather than hiding a button.
 */
describe('production and the conversation’s credential', () => {
  const key = { PROPOSALS_ANTHROPIC_API_KEY: 'sk-ant-api03-made-up' };

  it('refuses to start with it, saying why', async () => {
    await expect(
      startTestApp({
        env: { ENVIRONMENT_MODE: 'production', PUBLIC_URL: 'https://ricambi.example', ...key },
      }),
    ).rejects.toThrow(/PROPOSALS_ANTHROPIC_API_KEY.*Proposals are for practice systems/s);
  });

  it('leaves a practice system free to hold it', async () => {
    const app = await startTestApp({ env: key });
    await app.close();
  });
});

describe('production', () => {
  it('is allowed every one of them, because the refusals are about the mode and nothing else', async () => {
    let app: TestApp | undefined;
    try {
      app = await startTestApp({
        env: {
          ENVIRONMENT_MODE: 'production',
          REMINDERS_ENABLED: 'true',
          PUBLIC_URL: 'https://ricambi.example',
        },
        emailSender: senderThatReachesMembers,
        paymentProvider: providerThatReachesRealMandates,
      });

      const response = await app.request().get('/api/status').expect(200);
      expect(response.body.mode).toBe('production');
    } finally {
      await app?.close();
    }
  });
});
