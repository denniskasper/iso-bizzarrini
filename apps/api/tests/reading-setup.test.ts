import type { ReadingSetup } from '@ricambi/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureReading } from '../src/composition/reading.js';
import { loadConfig } from '../src/config/config.js';
import { givenAMember, givenAnAdministrator, givenAnEditor } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **The server reads with the Reading method it is configured with** (issue #55, ADR 0018), and
 * an Administrator can see which, and whether it is charged — never the credential behind it.
 *
 * Each case starts an app of its own with its Reading method handed in, as an e-mail sender is,
 * and asks what the Readings section says. The credentials are strings this suite made up and
 * looks for in every answer.
 */
const API_KEY = 'sk-ant-api03-an-api-key-this-suite-made-up';

function readingFor(env: Record<string, string>, machineLogin = false) {
  return configureReading(
    loadConfig({ DATABASE_URL: 'postgres://unused-in-tests/the-connection-is-injected', ...env })
      .reading,
    { machineLogin },
  );
}

async function setupSeenBy(app: TestApp): Promise<{ setup: ReadingSetup; text: string }> {
  const administrator = await givenAnAdministrator(app);
  const response = await administrator.agent.get('/api/reading-method').expect(200);
  return { setup: response.body as ReadingSetup, text: response.text };
}

describe('the Reading method an Administrator is shown', () => {
  const cases: {
    title: string;
    env: Record<string, string>;
    machineLogin?: boolean;
    expected: Omit<ReadingSetup, 'unavailable'>;
    unavailable: RegExp | null;
  }[] = [
    {
      title: 'a subscription, on the Claude Code login on this machine, and not charged',
      env: { READING_METHOD: 'subscription' },
      machineLogin: true,
      expected: { method: 'subscription', charged: false, available: true },
      unavailable: null,
    },
    {
      title: 'an API key, charged',
      env: { READING_METHOD: 'api-key', ANTHROPIC_API_KEY: API_KEY },
      expected: { method: 'api-key', charged: true, available: true },
      unavailable: null,
    },
    {
      title: 'the fake method, which invents what it reads and charges nothing',
      env: { READING_METHOD: 'fake' },
      expected: { method: 'fake', charged: false, available: true },
      unavailable: null,
    },
    {
      title: 'none, and why nothing can be read',
      env: {},
      expected: { method: null, charged: null, available: false },
      unavailable: /No Reading method is configured/,
    },
    {
      title: 'a subscription beside an API key, and why nothing can be read',
      env: { READING_METHOD: 'subscription', ANTHROPIC_API_KEY: API_KEY },
      machineLogin: true,
      expected: { method: 'subscription', charged: false, available: false },
      unavailable: /both ANTHROPIC_API_KEY and/,
    },
    {
      title: 'a subscription where Claude Code is not signed in on this machine',
      env: { READING_METHOD: 'subscription' },
      expected: { method: 'subscription', charged: false, available: false },
      unavailable: /not signed in on this machine.*claude auth login/,
    },
    {
      title: 'an API key that is not there, even where Claude Code is signed in',
      env: { READING_METHOD: 'api-key' },
      machineLogin: true,
      expected: { method: 'api-key', charged: true, available: false },
      unavailable: /no API key/,
    },
    {
      title: 'an API key, charged, beside a Claude Code login it never uses',
      env: { READING_METHOD: 'api-key', ANTHROPIC_API_KEY: API_KEY },
      machineLogin: true,
      expected: { method: 'api-key', charged: true, available: true },
      unavailable: null,
    },
  ];

  for (const { title, env, machineLogin, expected, unavailable } of cases) {
    it(`reports ${title}, and no credential`, async () => {
      const app = await startTestApp({ reading: readingFor(env, machineLogin) });
      try {
        const { setup, text } = await setupSeenBy(app);

        expect(setup).toMatchObject(expected);
        if (unavailable === null) {
          expect(setup.unavailable).toBeNull();
        } else {
          expect(setup.unavailable).toMatch(unavailable);
        }
        expect(text).not.toContain(API_KEY);
        expect(text).not.toMatch(/sk-ant/);
      } finally {
        await app.close();
      }
    });
  }
});

describe('who is told the Reading method', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp({ reading: readingFor({ READING_METHOD: 'fake' }) });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers an Editor as if there were nothing there', async () => {
    const editor = await givenAnEditor(app);
    await editor.get('/api/reading-method').expect(404);
  });

  it('answers a Member as if there were nothing there', async () => {
    const administrator = await givenAnAdministrator(app);
    const member = await givenAMember(app, administrator.agent);
    await member.agent.get('/api/reading-method').expect(404);
  });

  it('asks somebody who is not signed in to sign in', async () => {
    await app.request().get('/api/reading-method').expect(401);
  });
});

describe('a subscription on a server', () => {
  const server = {
    DATABASE_URL: 'postgres://unused-in-tests/the-connection-is-injected',
    NODE_ENV: 'production',
  };

  it('refuses to start, and says to read with an API key', () => {
    for (const ENVIRONMENT_MODE of ['non-production', 'production']) {
      expect(() =>
        loadConfig({ ...server, ENVIRONMENT_MODE, READING_METHOD: 'subscription' }),
      ).toThrow(/READING_METHOD is subscription.*READING_METHOD=api-key/s);
    }
  });

  it('starts with an API key', () => {
    expect(
      loadConfig({ ...server, READING_METHOD: 'api-key', ANTHROPIC_API_KEY: API_KEY }).reading,
    ).toEqual({ method: 'api-key', apiKey: API_KEY });
  });
});
