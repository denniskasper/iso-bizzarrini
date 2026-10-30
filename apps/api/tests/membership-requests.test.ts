import { sql } from 'drizzle-orm';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryEmailSender } from '../src/platform/email.js';
import { givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **A Visitor asks the Club for membership** (issue #131): one letter to the Club office, with
 * the Visitor's address to answer to, and nothing of it kept in Ricambi.
 *
 * Every request here is signed out, because that is who the form is for. Each test asks from an
 * address of its own: the limit on how often one address may ask is the application's, and
 * outlives the database being emptied between tests.
 */

/**
 * A mailbox this suite can read, which says of itself that it delivers — as the transport of the
 * Club's deployment does. The form is offered only where a letter would reach the office, and only
 * a production system may hold a transport that does.
 */
class DeliveringMailbox extends InMemoryEmailSender {
  override readonly reachesRealPeople = true;
}

const SENDING = { ENVIRONMENT_MODE: 'production', PUBLIC_URL: 'https://ricambi.example' };

const OFFICE = 'office@club.example';

const REQUEST = {
  name: 'Ada Visitor',
  email: 'ada@visitor.example',
  cars: 'Iso Grifo GL 365, 1966',
  message: 'I am restoring the front suspension and would like to join.',
  consent: true,
};

let nextAddress = 1;

/** A Visitor at an address no other test in this file asks from. */
function aVisitor(app: TestApp) {
  const address = `203.0.113.${nextAddress++}`;
  return {
    landing: () => app.request().get('/api/landing').set('X-Forwarded-For', address),
    ask: (body: object) =>
      app.request().post('/api/membership-requests').set('X-Forwarded-For', address).send(body),
  };
}

describe('a Visitor asking the Club for membership', () => {
  let app: TestApp;
  let administrator: TestAgent;

  beforeAll(async () => {
    app = await startTestApp({ env: SENDING, emails: new DeliveringMailbox() });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    administrator = (await givenAnAdministrator(app)).agent;
    await administrator.patch('/api/club').send({ officeEmail: OFFICE }).expect(200);
    app.emails.clear();
  });

  it('offers the form, with the Club office named', async () => {
    const response = await aVisitor(app).landing().expect(200);

    expect(response.body.landing).toMatchObject({ requestForm: true, officeEmail: OFFICE });
  });

  it('sends one letter to the Club office, to be answered to the Visitor', async () => {
    await aVisitor(app).ask(REQUEST).expect(204);

    expect(app.emails.sent).toHaveLength(1);
    const [letter] = app.emails.sent;
    expect(letter).toMatchObject({ to: OFFICE, replyTo: REQUEST.email });
    expect(letter?.subject).toBe('A request for membership, through Ricambi');
    expect(letter?.text).toContain('Ada Visitor');
    expect(letter?.text).toContain('ada@visitor.example');
    expect(letter?.text).toContain('Iso Grifo GL 365, 1966');
    expect(letter?.text).toContain('I am restoring the front suspension');
  });

  it('needs no car and no message', async () => {
    await aVisitor(app)
      .ask({ name: 'Ada Visitor', email: 'ada@visitor.example', consent: true })
      .expect(204);

    expect(app.emails.sentTo(OFFICE)).toHaveLength(1);
  });

  it('refuses a request without a name, a usable address or consent, and sends nothing', async () => {
    const visitor = aVisitor(app);

    for (const body of [
      { ...REQUEST, name: '  ' },
      { ...REQUEST, email: 'not an address' },
      { ...REQUEST, consent: false },
      { name: REQUEST.name, email: REQUEST.email },
    ]) {
      const response = await visitor.ask(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }

    expect(app.emails.sent).toHaveLength(0);
  });

  // The field a person never sees and a script fills in.
  it('refuses a request whose hidden field was filled in, and sends nothing', async () => {
    const response = await aVisitor(app)
      .ask({ ...REQUEST, website: 'https://spam.example' })
      .expect(400);

    expect(response.body.error.code).toBe('validation_failed');
    expect(app.emails.sent).toHaveLength(0);
  });

  it('refuses a burst from one address, and sends nothing for it', async () => {
    const visitor = aVisitor(app);
    for (let asked = 0; asked < 3; asked++) {
      await visitor.ask(REQUEST).expect(204);
    }

    const response = await visitor.ask(REQUEST).expect(429);

    expect(response.body.error.code).toBe('too_many_attempts');
    expect(app.emails.sent).toHaveLength(3);

    // Somebody else is not held to it,
    await aVisitor(app).ask(REQUEST).expect(204);
    // and the same address may ask again an hour later.
    app.clock.advanceBy(61 * 60 * 1000);
    await visitor.ask(REQUEST).expect(204);
    expect(app.emails.sent).toHaveLength(5);
  });

  it('writes nothing about the request to the database', async () => {
    const marker = 'a-phrase-only-this-request-carries';

    await aVisitor(app)
      .ask({
        name: `Ada ${marker}`,
        email: `${marker}@visitor.example`,
        cars: marker,
        message: marker,
        consent: true,
      })
      .expect(204);

    const tables = await app.db.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`,
    );
    for (const { tablename } of tables.rows) {
      const found = await app.db.execute<{ count: number }>(
        sql`SELECT count(*)::int AS count FROM ${sql.identifier(tablename)} AS row
            WHERE row::text LIKE ${`%${marker}%`}`,
      );
      expect(found.rows[0]?.count, tablename).toBe(0);
    }
  });

  it('offers no form and sends nothing while the Club has no office address', async () => {
    await administrator.patch('/api/club').send({ officeEmail: null }).expect(200);
    const visitor = aVisitor(app);

    const landing = await visitor.landing().expect(200);
    expect(landing.body.landing).toMatchObject({ requestForm: false, officeEmail: null });

    await visitor.ask(REQUEST).expect(503);
    expect(app.emails.sent).toHaveLength(0);
  });
});

describe('a Visitor where Ricambi cannot send e-mail', () => {
  let app: TestApp;

  beforeAll(async () => {
    // The capture this suite reads, saying truthfully that it reaches nobody: the log and the
    // practice systems' transports, and no transport at all, are all of this kind.
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    const administrator = (await givenAnAdministrator(app)).agent;
    await administrator.patch('/api/club').send({ officeEmail: OFFICE }).expect(200);
    app.emails.clear();
  });

  it('is shown the Club office’s address in place of the form', async () => {
    const response = await aVisitor(app).landing().expect(200);

    expect(response.body.landing).toMatchObject({ requestForm: false, officeEmail: OFFICE });
  });

  it('cannot send a request, and nothing is captured', async () => {
    await aVisitor(app).ask(REQUEST).expect(503);

    expect(app.emails.sent).toHaveLength(0);
  });
});
