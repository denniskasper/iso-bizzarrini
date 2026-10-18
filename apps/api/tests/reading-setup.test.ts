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
const SUBSCRIPTION_TOKEN = 'sk-ant-oat01-a-subscription-token-this-suite-made-up';
const API_KEY = 'sk-ant-api03-an-api-key-this-suite-made-up';

function readingFor(env: Record<string, string>) {
  return configureReading(
    loadConfig({ DATABASE_URL: 'postgres://unused-in-tests/the-connection-is-injected', ...env })
      .reading,
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
    expected: Omit<ReadingSetup, 'unavailable'>;
    unavailable: RegExp | null;
  }[] = [
    {
      title: 'a subscription, signed in through its token, and not charged',
      env: { READING_METHOD: 'subscription', CLAUDE_CODE_OAUTH_TOKEN: SUBSCRIPTION_TOKEN },
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
      title: 'both credentials present, and why nothing can be read',
      env: {
        READING_METHOD: 'subscription',
        CLAUDE_CODE_OAUTH_TOKEN: SUBSCRIPTION_TOKEN,
        ANTHROPIC_API_KEY: API_KEY,
      },
      expected: { method: 'subscription', charged: false, available: false },
      unavailable: /both a subscription token and an API key/,
    },
    {
      title: 'a subscription with no token to sign in with',
      env: { READING_METHOD: 'subscription' },
      expected: { method: 'subscription', charged: false, available: false },
      unavailable: /no subscription token/,
    },
    {
      title: 'an API key that is not there, even where a subscription token is',
      env: { READING_METHOD: 'api-key', CLAUDE_CODE_OAUTH_TOKEN: SUBSCRIPTION_TOKEN },
      expected: { method: 'api-key', charged: true, available: false },
      unavailable: /no API key/,
    },
  ];

  for (const { title, env, expected, unavailable } of cases) {
    it(`reports ${title}, and no credential`, async () => {
      const app = await startTestApp({ reading: readingFor(env) });
      try {
        const { setup, text } = await setupSeenBy(app);

        expect(setup).toMatchObject(expected);
        if (unavailable === null) {
          expect(setup.unavailable).toBeNull();
        } else {
          expect(setup.unavailable).toMatch(unavailable);
        }
        expect(text).not.toContain(SUBSCRIPTION_TOKEN);
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
