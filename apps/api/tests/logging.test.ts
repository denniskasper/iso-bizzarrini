import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { accounts } from '../src/db/schema.js';
import { createLogger } from '../src/platform/logger.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **What the log keeps when something fails** (issue #9).
 *
 * The privacy statement says what is written to the server's log, and the log is the one place
 * personal data could accumulate outside the retention rules: nothing sweeps it. A failed query
 * is the way it would get there — the database layer reports the statement *and the values it
 * was run with*, and the driver quotes the offending row back — so this is proved against a
 * query that really failed, with the errors the two of them really raise.
 */
describe('the log', () => {
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

  const giulia = {
    email: 'giulia.rossi@club.example',
    name: 'Giulia Rossi',
    passwordHash: 'scrypt$a-hash-nobody-should-ever-read-in-a-log',
    addedAt: new Date('2026-01-15T09:00:00.000Z'),
  };

  /** Recording the same person twice, which the roster's uniqueness rule refuses. */
  async function aQueryThatFailed(): Promise<unknown> {
    await app.db.insert(accounts).values(giulia);
    try {
      await app.db.insert(accounts).values(giulia);
    } catch (error) {
      return error;
    }
    throw new Error('The second insert was expected to fail.');
  }

  function logging(error: unknown): string {
    const lines: string[] = [];
    const logger = createLogger(
      { ...app.config, logLevel: 'info' },
      { write: (line) => lines.push(line) },
    );
    logger.error({ err: error }, 'Unhandled error');
    return lines.join('');
  }

  it('does not write down the values a failed query was run with', async () => {
    const written = logging(await aQueryThatFailed());

    expect(written).not.toContain(giulia.email);
    expect(written).not.toContain(giulia.name);
    expect(written).not.toContain(giulia.passwordHash);
  });

  /** Stripped of who it was about, it still has to be something a fault can be found from. */
  it('still says which statement failed, and which rule refused it', async () => {
    const [line] = logging(await aQueryThatFailed())
      .trim()
      .split('\n');
    const { err } = JSON.parse(line ?? '{}');

    expect(err.message).toMatch(/^Failed query: insert into "accounts"/);
    expect(err.stack).toContain('logging.test.ts');
    expect(err.cause).toMatchObject({ code: '23505', constraint: 'accounts_email_unique' });
  });

  it('writes an ordinary failure down as it always did', () => {
    const written = JSON.parse(logging(new TypeError('The archive tripped over its own feet.')));

    expect(written.err).toMatchObject({
      type: 'TypeError',
      message: 'The archive tripped over its own feet.',
    });
    expect(written.err.stack).toContain('logging.test.ts');
  });

  /** Wrapped a second time, the way a service reports what it was doing when the query failed. */
  it('is not fooled by a failed query wrapped in another error', async () => {
    const wrapped = new Error('Could not record the member.', { cause: await aQueryThatFailed() });

    const written = logging(wrapped);

    expect(written).toContain('Could not record the member.');
    expect(written).not.toContain(giulia.email);
    expect(written).not.toContain(giulia.passwordHash);
  });
});
