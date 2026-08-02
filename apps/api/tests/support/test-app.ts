import type { Express } from 'express';
import supertest from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { createApp } from '../../src/app.js';
import { loadConfig, type AppConfig } from '../../src/config/config.js';
import type { Db } from '../../src/db/client.js';
import { MutableClock } from '../../src/platform/clock.js';
import { InMemoryEmailSender } from '../../src/platform/email.js';
import { UnconfiguredPaymentProvider, type PaymentProvider } from '../../src/platform/payments.js';
import { createTestDatabase, type TestDatabase } from './test-database.js';

/**
 * The primary test seam: the application driven in-process over real HTTP, against a real
 * Postgres, with none of our own code mocked. Only the three edges the spec names are faked —
 * the clock, the e-mail sender and the payment provider.
 */
export interface TestApp {
  readonly app: Express;
  readonly config: AppConfig;
  readonly db: Db;
  readonly clock: MutableClock;
  readonly emails: InMemoryEmailSender;
  /** A fresh request with no cookies. */
  request(): TestAgent;
  /** A request agent that keeps its cookies, for signed-in flows. */
  agent(): TestAgent;
  /** Empties the database between tests. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

export interface TestAppOptions {
  /** Environment overrides, applied on top of the test defaults. */
  env?: Record<string, string>;
  now?: Date;
  paymentProvider?: PaymentProvider;
}

/** Well before any date the catalog cares about, and stable, so tests never depend on today. */
export const DEFAULT_TEST_NOW = new Date('2026-01-15T09:00:00.000Z');

export async function startTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const database: TestDatabase = await createTestDatabase();

  const config = loadConfig({
    NODE_ENV: 'test',
    ENVIRONMENT_NAME: 'test',
    DATABASE_URL: 'postgres://unused-in-tests/the-connection-is-injected',
    LOG_LEVEL: 'silent',
    EMAIL_TRANSPORT: 'memory',
    ...options.env,
  });

  const clock = new MutableClock(options.now ?? DEFAULT_TEST_NOW);
  const emails = new InMemoryEmailSender();

  const app = createApp({
    config,
    clock,
    db: database.db,
    emailSender: emails,
    paymentProvider: options.paymentProvider ?? new UnconfiguredPaymentProvider(),
  });

  return {
    app,
    config,
    db: database.db,
    clock,
    emails,
    request: () => supertest(app),
    agent: () => supertest.agent(app),
    async reset() {
      await database.truncateAll();
      emails.clear();
      clock.setTo(options.now ?? DEFAULT_TEST_NOW);
    },
    close: () => database.close(),
  };
}
