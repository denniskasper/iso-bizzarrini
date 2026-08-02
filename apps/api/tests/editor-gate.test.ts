import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertSafeForEnvironment } from '../src/composition/environment-safety.js';
import { loadConfig } from '../src/config/config.js';
import { InMemoryEmailSender } from '../src/platform/email.js';
import { UnconfiguredPaymentProvider } from '../src/platform/payments.js';
import { startTestApp, TEST_EDITOR_PASSPHRASE, type TestApp } from './support/test-app.js';

/**
 * The stand-in Editor gate. One shared passphrase is the whole of M1's "single hard-coded admin
 * login"; Accounts, Memberships and per-person passwords arrive with ticket 14.
 */
describe('the stand-in Editor gate', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
  });

  it('reports nobody signed in before anyone has been through it', async () => {
    const response = await app.request().get('/api/session').expect(200);

    expect(response.body).toEqual({ signedIn: false });
  });

  it('admits the configured passphrase and remembers it', async () => {
    const agent = app.agent();

    await agent.post('/api/session').send({ passphrase: TEST_EDITOR_PASSPHRASE }).expect(201);

    const response = await agent.get('/api/session').expect(200);
    expect(response.body).toEqual({ signedIn: true });
  });

  it('refuses the wrong passphrase', async () => {
    const response = await app
      .request()
      .post('/api/session')
      .send({ passphrase: 'not the passphrase' })
      .expect(401);

    expect(response.body.error).toMatchObject({ code: 'not_signed_in' });
  });

  it('forgets an Editor who signs out', async () => {
    const agent = await app.editor();

    await agent.delete('/api/session').expect(200);

    const response = await agent.get('/api/session').expect(200);
    expect(response.body).toEqual({ signedIn: false });
  });

  it('ignores a cookie it did not sign', async () => {
    const response = await app
      .request()
      .get('/api/session')
      .set('Cookie', 'ricambi_editor=made.up')
      .expect(200);

    expect(response.body).toEqual({ signedIn: false });
  });

  it('stops honouring a session once it has expired', async () => {
    const agent = await app.editor();

    app.clock.advanceByDays(31);

    const response = await agent.get('/api/session').expect(200);
    expect(response.body).toEqual({ signedIn: false });
  });
});

describe('an Editor gate nobody configured', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp({ env: { EDITOR_PASSWORD: '' } });
  });

  afterAll(async () => {
    await app.close();
  });

  // An unset passphrase admits nobody rather than everybody. An archive that refuses everyone
  // is a nuisance; an archive that admits everyone is the Club's promise to its members broken.
  it('admits nobody at all', async () => {
    await app.request().post('/api/session').send({ passphrase: '' }).expect(400);
    await app.request().post('/api/session').send({ passphrase: 'anything' }).expect(401);
    await app.request().post('/api/models').send({ brand: 'Iso', name: 'Grifo' }).expect(401);
  });
});

describe('the stand-in gate and production', () => {
  const environment = {
    NODE_ENV: 'production',
    ENVIRONMENT_NAME: 'the-archive',
    ENVIRONMENT_MODE: 'production',
    DATABASE_URL: 'postgres://unused/in-this-test',
  };

  function assertSafe(overrides: Record<string, string>): void {
    assertSafeForEnvironment({
      config: loadConfig({ ...environment, ...overrides }),
      emailSender: new InMemoryEmailSender(),
      paymentProvider: new UnconfiguredPaymentProvider(),
    });
  }

  // The way a stand-in becomes permanent is that nobody gets round to replacing it. This one
  // guards the Club's drawings, so it is not allowed to be the thing guarding them for real.
  it('refuses to start production while the shared passphrase is set', () => {
    expect(() => assertSafe({ EDITOR_PASSWORD: 'a-shared-passphrase' })).toThrow(/EDITOR_PASSWORD/);
  });

  it('is content with a production environment that has none', () => {
    expect(() => assertSafe({})).not.toThrow();
  });
});
