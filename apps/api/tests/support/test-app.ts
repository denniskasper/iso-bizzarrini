import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Express } from 'express';
import supertest from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { createApp } from '../../src/app.js';
import { createPasswordHasher } from '../../src/access/passwords.js';
import { configureReading, type ConfiguredReading } from '../../src/composition/reading.js';
import { loadConfig, type AppConfig } from '../../src/config/config.js';
import type { Db } from '../../src/db/client.js';
import type { BreachedPasswordCheck } from '../../src/platform/breached-passwords.js';
import type { Build } from '../../src/platform/build.js';
import { MutableClock } from '../../src/platform/clock.js';
import { InMemoryEmailSender, type EmailSender } from '../../src/platform/email.js';
import { createLogger, type Logger } from '../../src/platform/logger.js';
import { UnconfiguredPaymentProvider, type PaymentProvider } from '../../src/platform/payments.js';
import { createTestDatabase, type TestDatabase } from './test-database.js';

/**
 * The primary test seam: the application driven in-process over real HTTP, against a real
 * Postgres, with none of our own code mocked. Only the edges the spec names are faked — the
 * clock, the e-mail sender, the payment provider and the breached-password list.
 *
 * The image store is **not** faked. It is a directory, and a directory of its own in the
 * system's temporary space is both cheaper and truer than a stub: ingest really runs, the
 * files really land, and the image route really reads them back.
 *
 * **Neither is the password hasher.** It is the real scrypt through the real encoding, at a cost
 * this suite can afford to pay a few hundred times — a stub would stop proving that what is
 * written can be read back, which is the only thing about password storage worth a test.
 */
export interface TestApp {
  readonly app: Express;
  readonly config: AppConfig;
  readonly db: Db;
  readonly clock: MutableClock;
  readonly emails: InMemoryEmailSender;
  readonly breached: KnownBreachedPasswords;
  readonly logger: Logger;
  /** Where this app's scans are written, for a test that wants to look at the store itself. */
  readonly filesPath: string;
  /** A fresh request with no cookies. */
  request(): TestAgent;
  /** A request agent that keeps its cookies, for signed-in flows. */
  agent(): TestAgent;
  /** An agent signed in as a member, by their address and their own password. */
  memberAgent(credentials: { email: string; password: string }): Promise<TestAgent>;
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
  /**
   * The capture itself, where a test needs one that **says it delivers**. A system only sends
   * reminders through a sender that can reach somebody, so the suite about reminders hands in a
   * mailbox that claims to — and still, being a list in memory, reaches nobody.
   */
  emails?: InMemoryEmailSender;
  paymentProvider?: PaymentProvider;
  /**
   * What the catalog is read with. Defaults to whatever `env` configures, which is none unless a
   * test says `READING_METHOD`.
   */
  reading?: ConfiguredReading;
  /** What the server says it was built as. Defaults to what this checkout says it is. */
  build?: Build;
}

/**
 * The breached-password edge, faked: a list this suite writes rather than one somebody else
 * hosts. Everything about the rule is exercised except the HTTP call, which is the part a test
 * seam must not depend on being up.
 */
export class KnownBreachedPasswords implements BreachedPasswordCheck {
  readonly name = 'a list of passwords this test wrote';
  readonly #breached = new Set<string>();

  async isBreached(password: string): Promise<boolean> {
    return this.#breached.has(password);
  }

  treatAsBreached(password: string): void {
    this.#breached.add(password);
  }

  clear(): void {
    this.#breached.clear();
  }
}

/**
 * A cost far below the recommended one, and deliberately still a real one.
 *
 * `2^14` runs in about a twentieth of the time `2^17` does, which is what makes a suite that
 * signs in a few hundred times affordable. What it does *not* do is change the algorithm, the
 * encoding, or the path a password takes — and because the parameters travel inside the stored
 * string, a hash written here would still verify under production's cost.
 */
export const TEST_PASSWORD_COST = { N: 2 ** 14, r: 8, p: 1 };

/** Well before any date the catalog cares about, and stable, so tests never depend on today. */
export const DEFAULT_TEST_NOW = new Date('2026-01-15T09:00:00.000Z');

export async function startTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const filesPath = await mkdtemp(join(tmpdir(), 'ricambi-files-'));

  const config = loadConfig({
    NODE_ENV: 'test',
    ENVIRONMENT_NAME: 'test',
    DATABASE_URL: 'postgres://unused-in-tests/the-connection-is-injected',
    LOG_LEVEL: 'silent',
    EMAIL_TRANSPORT: 'memory',
    SESSION_SECRET: 'a-session-secret-long-enough-for-the-schema',
    FILE_STORAGE_PATH: filesPath,
    ...options.env,
  });

  const clock = new MutableClock(options.now ?? DEFAULT_TEST_NOW);
  const logger = createLogger(config);
  const emails = options.emails ?? new InMemoryEmailSender();
  const emailSender = options.emailSender ?? emails;
  const paymentProvider = options.paymentProvider ?? new UnconfiguredPaymentProvider();
  const breached = new KnownBreachedPasswords();

  const database: TestDatabase = await createTestDatabase();

  let app: Express;
  try {
    app = createApp({
      config,
      clock,
      db: database.db,
      emailSender,
      paymentProvider,
      breachedPasswords: breached,
      reading: options.reading ?? configureReading(config.reading),
      passwordHasher: createPasswordHasher(TEST_PASSWORD_COST),
      logger,
      build: options.build,
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
    breached,
    logger,
    filesPath,
    request: () => supertest(app),
    agent: () => supertest.agent(app),
    async memberAgent(credentials) {
      const agent = supertest.agent(app);
      await agent.post('/api/session').send(credentials).expect(201);
      return agent;
    },
    async reset() {
      await database.truncateAll();
      emails.clear();
      breached.clear();
      clock.setTo(options.now ?? DEFAULT_TEST_NOW);
    },
    async close() {
      await database.close();
      await rm(filesPath, { recursive: true, force: true });
    },
  };
}
