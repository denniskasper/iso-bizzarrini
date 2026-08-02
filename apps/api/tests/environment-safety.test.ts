import { describe, expect, it } from 'vitest';
import { assertSeedable, EnvironmentSafetyError } from '../src/composition/environment-safety.js';
import { loadConfig, type AppConfig } from '../src/config/config.js';
import type { EmailSender } from '../src/platform/email.js';
import type { PaymentEvent, PaymentProvider } from '../src/platform/payments.js';
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

describe('production', () => {
  it('is allowed every one of them, because the refusals are about the mode and nothing else', async () => {
    let app: TestApp | undefined;
    try {
      app = await startTestApp({
        env: { ENVIRONMENT_MODE: 'production', REMINDERS_ENABLED: 'true', EDITOR_PASSWORD: '' },
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
