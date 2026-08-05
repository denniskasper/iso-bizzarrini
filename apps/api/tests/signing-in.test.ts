import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SESSION_DURATION_MS } from '../src/access/session.js';
import { A_GOOD_PASSWORD, givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * Signing in as a person, rather than with a shared passphrase.
 *
 * **Authenticate, then authorise.** Almost everything here is about the first half being careful
 * and the second half being plain: a stranger is told nothing at all about who is on the roster,
 * and a member who has proved who they are is told exactly what is wrong.
 */
describe('signing in', () => {
  let app: TestApp;
  let administrator: TestAgent;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    administrator = (await givenAnAdministrator(app)).agent;
  });

  it('lets a member in with the address the Club has and the password they chose', async () => {
    const { email } = await givenAMember(app, administrator, { name: 'Giulia Rossi' });

    const agent = app.agent();
    const response = await agent
      .post('/api/session')
      .send({ email, password: A_GOOD_PASSWORD })
      .expect(201);

    expect(response.body.account).toMatchObject({
      name: 'Giulia Rossi',
      email,
      role: 'member',
      membershipIsLive: true,
    });

    await agent.get('/api/models').expect(200);
  });

  it('does not care what case the address was typed in', async () => {
    await givenAMember(app, administrator, { email: 'giulia@club.example' });

    await app
      .request()
      .post('/api/session')
      .send({ email: '  GIULIA@Club.Example ', password: A_GOOD_PASSWORD })
      .expect(201);
  });

  /**
   * **The one rule the sign-in form exists to keep** (story 7). A club of a hundred enthusiasts
   * is a list somebody would like to have, and a form that says "no such member" hands it over
   * one address at a time. So the three refusals below are literally the same refusal.
   */
  describe('refusing without saying who is on the roster', () => {
    it('answers an unknown address and a wrong password identically', async () => {
      const { email } = await givenAMember(app, administrator);

      const unknown = await app
        .request()
        .post('/api/session')
        .send({ email: 'nobody@club.example', password: A_GOOD_PASSWORD })
        .expect(401);

      const wrong = await app
        .request()
        .post('/api/session')
        .send({ email, password: 'not-the-password-they-chose' })
        .expect(401);

      expect(unknown.body).toEqual(wrong.body);
      expect(unknown.body.error.message).toMatch(/contact the Club office/);
    });

    it('answers somebody who is on the roster but has never chosen a password the same way', async () => {
      const { email } = await givenAMember(app, administrator, { activate: false });

      const response = await app
        .request()
        .post('/api/session')
        .send({ email, password: A_GOOD_PASSWORD })
        .expect(401);

      expect(response.body.error.message).toMatch(/contact the Club office/);
    });

    it('says nothing about the roster when somebody asks for a reset link', async () => {
      const { email } = await givenAMember(app, administrator);

      const known = await app.request().post('/api/password-resets').send({ email }).expect(202);
      const unknown = await app
        .request()
        .post('/api/password-resets')
        .send({ email: 'nobody@club.example' })
        .expect(202);

      expect(known.text).toBe(unknown.text);
      expect(app.emails.sentTo('nobody@club.example')).toHaveLength(0);
    });
  });

  describe('rate limiting and lockout', () => {
    /**
     * Eight is chosen against the people rather than against the attacker: this membership signs
     * in twice a year on a phone in a cold garage, and three would lock out members and stop
     * nobody. What stops guessing is the quarter of an hour that follows.
     */
    it('locks an address out after repeated failures, and says so', async () => {
      const { email } = await givenAMember(app, administrator);

      for (let attempt = 0; attempt < 8; attempt += 1) {
        await app.request().post('/api/session').send({ email, password: 'wrong' }).expect(401);
      }

      const locked = await app
        .request()
        .post('/api/session')
        .send({ email, password: 'wrong' })
        .expect(429);
      expect(locked.body.error.code).toBe('too_many_attempts');

      // Even the right password, which is what makes it a lockout rather than a slow refusal.
      await app
        .request()
        .post('/api/session')
        .send({ email, password: A_GOOD_PASSWORD })
        .expect(429);
    });

    it('lets them in again once the lockout has passed', async () => {
      const { email } = await givenAMember(app, administrator);

      for (let attempt = 0; attempt < 8; attempt += 1) {
        await app.request().post('/api/session').send({ email, password: 'wrong' }).expect(401);
      }
      await app.request().post('/api/session').send({ email, password: 'wrong' }).expect(429);

      app.clock.advanceBy(16 * 60 * 1000);
      await app
        .request()
        .post('/api/session')
        .send({ email, password: A_GOOD_PASSWORD })
        .expect(201);
    });

    /** A member who mistypes four times and then gets it right starts from nothing next time. */
    it('forgets the count once somebody signs in', async () => {
      const { email } = await givenAMember(app, administrator);

      for (let attempt = 0; attempt < 7; attempt += 1) {
        await app.request().post('/api/session').send({ email, password: 'wrong' }).expect(401);
      }
      await app
        .request()
        .post('/api/session')
        .send({ email, password: A_GOOD_PASSWORD })
        .expect(201);

      for (let attempt = 0; attempt < 7; attempt += 1) {
        await app.request().post('/api/session').send({ email, password: 'wrong' }).expect(401);
      }
      await app
        .request()
        .post('/api/session')
        .send({ email, password: A_GOOD_PASSWORD })
        .expect(201);
    });

    it('counts old failures out, so a mistake a month ago is not held against anybody', async () => {
      const { email } = await givenAMember(app, administrator);

      for (let attempt = 0; attempt < 7; attempt += 1) {
        await app.request().post('/api/session').send({ email, password: 'wrong' }).expect(401);
      }

      app.clock.advanceBy(16 * 60 * 1000);

      // The window has passed, so this is the first failure again rather than the eighth.
      await app.request().post('/api/session').send({ email, password: 'wrong' }).expect(401);
      await app
        .request()
        .post('/api/session')
        .send({ email, password: A_GOOD_PASSWORD })
        .expect(201);
    });

    /**
     * **An address nobody has heard of is counted exactly like one on the roster.** If it were
     * not, the lockout would become the disclosure the sign-in form refuses to be: type nine
     * times, and whether you are locked out tells you whether that person is a member.
     */
    it('locks out an address that is on no roster at all', async () => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await app
          .request()
          .post('/api/session')
          .send({ email: 'nobody@club.example', password: 'wrong' })
          .expect(401);
      }

      await app
        .request()
        .post('/api/session')
        .send({ email: 'nobody@club.example', password: 'wrong' })
        .expect(429);
    });
  });

  describe('a Membership that has run out', () => {
    /**
     * **A lapsed member authenticates successfully** (story 8) and is refused afterwards. They
     * have proved who they are, so the refusal can name the date — which is a sentence somebody
     * acts on, where a sign-in error is a sentence they telephone the Club about.
     */
    it('lets them sign in and then refuses the archive, naming the date', async () => {
      const { email } = await givenAMember(app, administrator, { paidThrough: '2026-01-31' });
      app.clock.setTo(new Date('2026-02-05T09:00:00.000Z'));

      const agent = app.agent();
      const signedIn = await agent
        .post('/api/session')
        .send({ email, password: A_GOOD_PASSWORD })
        .expect(201);

      expect(signedIn.body.account).toMatchObject({
        membershipIsLive: false,
        paidThrough: '2026-01-31',
      });

      const refused = await agent.get('/api/models').expect(403);
      expect(refused.body.error.code).toBe('membership_lapsed');
      expect(refused.body.error.message).toContain('2026-01-31');
    });

    /** Checked on every request, so a lapse takes effect mid-session (story 20). */
    it('stops a session working the moment the term runs out under it', async () => {
      const member = await givenAMember(app, administrator, { paidThrough: '2026-01-31' });

      await member.agent.get('/api/models').expect(200);

      app.clock.setTo(new Date('2026-02-01T00:00:00.000Z'));
      await member.agent.get('/api/models').expect(403);
    });
  });

  describe('staying signed in, and signing out', () => {
    it('keeps a member signed in for ninety days, so twice-a-year visits do not need a password', async () => {
      const member = await givenAMember(app, administrator, { paidThrough: '2027-12-31' });

      app.clock.advanceBy(SESSION_DURATION_MS - 60_000);
      await member.agent.get('/api/models').expect(200);

      app.clock.advanceBy(120_000);
      await member.agent.get('/api/models').expect(401);
    });

    /** One press, for a shared computer (story 15). */
    it('forgets a member who signs out', async () => {
      const member = await givenAMember(app, administrator);

      await member.agent.delete('/api/session').expect(200);

      const response = await member.agent.get('/api/session').expect(200);
      expect(response.body).toEqual({ signedIn: false, account: null });
      await member.agent.get('/api/models').expect(401);
    });

    it('stops honouring a session whose Account has been deleted', async () => {
      const member = await givenAMember(app, administrator);

      await app.db.execute(`delete from accounts where email = '${member.email}'`);

      await member.agent.get('/api/models').expect(401);
    });
  });

  describe('what a request may claim', () => {
    it('refuses a body that is neither a passphrase nor an address and password', async () => {
      await app.request().post('/api/session').send({ email: 'giulia@club.example' }).expect(400);
      await app.request().post('/api/session').send({}).expect(400);
    });

    it('ignores a cookie it did not sign', async () => {
      const response = await app
        .request()
        .get('/api/session')
        .set('Cookie', 'ricambi_session=eyJzdWIiOiJhbnlvbmUifQ.made-up')
        .expect(200);

      expect(response.body).toEqual({ signedIn: false, account: null });
    });
  });
});
