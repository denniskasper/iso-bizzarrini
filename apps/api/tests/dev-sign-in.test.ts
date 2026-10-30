import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertSafeForEnvironment,
  EnvironmentSafetyError,
} from '../src/composition/environment-safety.js';
import { ConfigurationError, loadConfig } from '../src/config/config.js';
import { InMemoryEmailSender } from '../src/platform/email.js';
import { UnconfiguredPaymentProvider } from '../src/platform/payments.js';
import { givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * `DEV_SIGN_IN_AS`: `pnpm dev` on a machine only its owner reaches opens straight into the
 * archive. What matters as much as that it works is everywhere it is refused.
 */
const DEVELOPER = 'developer@club.example';

describe('signing in as a developer, in development', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp({ env: { NODE_ENV: 'development', DEV_SIGN_IN_AS: DEVELOPER } });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
  });

  it('treats a request without a session as the Account it names', async () => {
    await givenAnAdministrator(app, { name: 'A Developer', email: DEVELOPER });

    const response = await app.request().get('/api/session').expect(200);
    expect(response.body.account).toMatchObject({ email: DEVELOPER, role: 'administrator' });

    await app.request().get('/api/models').expect(200);
  });

  it('lets nobody in when the Account it names is not on the roster', async () => {
    await app.request().get('/api/models').expect(401);
  });
});

describe('where signing in as a developer is refused', () => {
  function configFor(overrides: Record<string, string>) {
    return loadConfig({
      ENVIRONMENT_NAME: 'test',
      DATABASE_URL: 'postgres://unused-in-tests/the-connection-is-injected',
      DEV_SIGN_IN_AS: DEVELOPER,
      ...overrides,
    });
  }

  it('outside development', () => {
    expect(() => configFor({ NODE_ENV: 'production' })).toThrow(ConfigurationError);
    expect(() => configFor({ NODE_ENV: 'test' })).toThrow(/DEV_SIGN_IN_AS/);
  });

  it('in production, even in development', () => {
    const config = configFor({
      NODE_ENV: 'development',
      ENVIRONMENT_MODE: 'production',
      PUBLIC_URL: 'https://ricambi.example',
    });

    expect(() =>
      assertSafeForEnvironment({
        config,
        emailSender: new InMemoryEmailSender(),
        paymentProvider: new UnconfiguredPaymentProvider(),
      }),
    ).toThrow(EnvironmentSafetyError);
  });
});
