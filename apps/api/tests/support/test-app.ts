import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Express } from 'express';
import supertest from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { createApp } from '../../src/app.js';
import { loadConfig, type AppConfig } from '../../src/config/config.js';
import type { Db } from '../../src/db/client.js';
import { MutableClock } from '../../src/platform/clock.js';
import { InMemoryEmailSender, type EmailSender } from '../../src/platform/email.js';
import { UnconfiguredPaymentProvider, type PaymentProvider } from '../../src/platform/payments.js';
import { createTestDatabase, type TestDatabase } from './test-database.js';

/**
 * The primary test seam: the application driven in-process over real HTTP, against a real
 * Postgres, with none of our own code mocked. Only the three edges the spec names are faked —
 * the clock, the e-mail sender and the payment provider.
 *
 * The image store is **not** faked. It is a directory, and a directory of its own in the
 * system's temporary space is both cheaper and truer than a stub: ingest really runs, the
 * files really land, and the image route really reads them back.
 */
export interface TestApp {
  readonly app: Express;
  readonly config: AppConfig;
  readonly db: Db;
  readonly clock: MutableClock;
  readonly emails: InMemoryEmailSender;
  /** Where this app's scans are written, for a test that wants to look at the store itself. */
  readonly filesPath: string;
  /** A fresh request with no cookies. */
  request(): TestAgent;
  /** A request agent that keeps its cookies, for signed-in flows. */
  agent(): TestAgent;
  /** An agent that has been through the Editor gate. */
  editor(): Promise<TestAgent>;
  /** Empties the database between tests. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

export interface TestAppOptions {
  /** Environment overrides, applied on top of the test defaults. */
  env?: Record<string, string>;
  now?: Date;
  /**
   * A sender other than the in-memory capture. Only the environment-safety tests need this, to
   * hand the application something that says it can reach a real person; `emails` below stays
   * the capture either way.
   */
  emailSender?: EmailSender;
  paymentProvider?: PaymentProvider;
}

/** Well before any date the catalog cares about, and stable, so tests never depend on today. */
export const DEFAULT_TEST_NOW = new Date('2026-01-15T09:00:00.000Z');

/**
 * The stand-in Editor gate's passphrase, in tests. Nothing anywhere else knows it.
 *
 * Every test app is handed it, so signing in is one call. A test that starts a **production**
 * environment has to clear it with `EDITOR_PASSWORD: ''`: the application refuses to start in
 * production while the shared-passphrase gate is configured, which is the whole point of it.
 */
export const TEST_EDITOR_PASSPHRASE = 'a-passphrase-for-tests';

export async function startTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const filesPath = await mkdtemp(join(tmpdir(), 'ricambi-files-'));

  const config = loadConfig({
    NODE_ENV: 'test',
    ENVIRONMENT_NAME: 'test',
    DATABASE_URL: 'postgres://unused-in-tests/the-connection-is-injected',
    LOG_LEVEL: 'silent',
    EMAIL_TRANSPORT: 'memory',
    EDITOR_PASSWORD: TEST_EDITOR_PASSPHRASE,
    SESSION_SECRET: 'a-session-secret-long-enough-for-the-schema',
    FILE_STORAGE_PATH: filesPath,
    ...options.env,
  });

  const clock = new MutableClock(options.now ?? DEFAULT_TEST_NOW);
  const emails = new InMemoryEmailSender();
  const emailSender = options.emailSender ?? emails;
  const paymentProvider = options.paymentProvider ?? new UnconfiguredPaymentProvider();

  const database: TestDatabase = await createTestDatabase();

  let app: Express;
  try {
    app = createApp({
      config,
      clock,
      db: database.db,
      emailSender,
      paymentProvider,
    });
  } catch (error) {
    // The application refuses to start in an unsafe environment. Leave nothing behind it.
    await database.close();
    await rm(filesPath, { recursive: true, force: true });
    throw error;
  }

  return {
    app,
    config,
    db: database.db,
    clock,
    emails,
    filesPath,
    request: () => supertest(app),
    agent: () => supertest.agent(app),
    async editor() {
      const agent = supertest.agent(app);
      await agent.post('/api/session').send({ passphrase: TEST_EDITOR_PASSPHRASE }).expect(201);
      return agent;
    },
    async reset() {
      await database.truncateAll();
      emails.clear();
      clock.setTo(options.now ?? DEFAULT_TEST_NOW);
    },
    async close() {
      await database.close();
      await rm(filesPath, { recursive: true, force: true });
    },
  };
}
