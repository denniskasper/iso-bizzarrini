import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPasswordHasher, STANDARD_COST } from '../src/access/passwords.js';
import { PASSWORD_RESET_LIFETIME_MS, INVITATION_LIFETIME_MS } from '../src/access/tokens.js';
import {
  A_GOOD_PASSWORD,
  givenAMember,
  givenAnAdministrator,
  linkTokenSentTo,
} from './support/roster.js';
import { startTestApp, TEST_PASSWORD_COST, type TestApp } from './support/test-app.js';

/**
 * Choosing a password, and getting a new one when it has been forgotten.
 *
 * The rules are ADR 0003's, and every one of them is a deliberate *absence* as much as a
 * presence: ten characters, no composition rules, no rotation, no expiry — plus the one rule
 * that is about the password rather than its shape, which is whether it has already been stolen.
 */
describe('passwords', () => {
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

  describe('what the archive will accept', () => {
    it('wants ten characters and nothing else whatsoever', async () => {
      const { email } = await givenAMember(app, administrator, { activate: false });
      const token = linkTokenSentTo(app, email);

      const tooShort = await app
        .request()
        .post('/api/password-setups')
        .send({ token, password: 'nine char' })
        .expect(400);
      expect(tooShort.body.error.message).toMatch(/at least 10 characters/);

      // Ten plain lower-case letters: no capital, no digit, no punctuation, and accepted.
      await app
        .request()
        .post('/api/password-setups')
        .send({ token, password: 'wheelbarrow' })
        .expect(201);
    });

    /**
     * **A password refused does not cost the member their link.** The rules are checked before
     * the link is spent, so somebody whose first choice was too short can simply choose again —
     * otherwise the first mistake would cost them a message to the Club office.
     */
    it('leaves the link usable after refusing a password', async () => {
      const { email } = await givenAMember(app, administrator, { activate: false });
      const token = linkTokenSentTo(app, email);

      await app
        .request()
        .post('/api/password-setups')
        .send({ token, password: 'short' })
        .expect(400);

      await app
        .request()
        .post('/api/password-setups')
        .send({ token, password: A_GOOD_PASSWORD })
        .expect(201);
    });

    it('refuses one that has appeared in a known breach, and says why', async () => {
      app.breached.treatAsBreached('correct-horse-battery-staple');
      const { email } = await givenAMember(app, administrator, { activate: false });
      const token = linkTokenSentTo(app, email);

      const response = await app
        .request()
        .post('/api/password-setups')
        .send({ token, password: 'correct-horse-battery-staple' })
        .expect(400);

      expect(response.body.error.message).toMatch(/known data breach/);

      // And the link survives that too, so the member can simply pick another.
      await app
        .request()
        .post('/api/password-setups')
        .send({ token, password: A_GOOD_PASSWORD })
        .expect(201);
    });

    it('signs the member in the moment they have chosen one', async () => {
      const { email } = await givenAMember(app, administrator, { activate: false });
      const token = linkTokenSentTo(app, email);

      const agent = app.agent();
      const response = await agent
        .post('/api/password-setups')
        .send({ token, password: A_GOOD_PASSWORD })
        .expect(201);

      expect(response.body.account).toMatchObject({ email, membershipIsLive: true });
      await agent.get('/api/models').expect(200);
    });
  });

  describe('the link itself', () => {
    it('says what it is for before anybody types a password into it', async () => {
      const { email } = await givenAMember(app, administrator, {
        name: 'Giulia Rossi',
        activate: false,
      });

      const response = await app
        .request()
        .post('/api/password-setups/inspect')
        .send({ token: linkTokenSentTo(app, email) })
        .expect(200);

      expect(response.body).toEqual({ purpose: 'invitation', name: 'Giulia Rossi', email });
    });

    /** Single use, so a forwarded e-mail cannot be used against anybody (story 4). */
    it('works once', async () => {
      const { email } = await givenAMember(app, administrator, { activate: false });
      const token = linkTokenSentTo(app, email);

      await app
        .request()
        .post('/api/password-setups')
        .send({ token, password: A_GOOD_PASSWORD })
        .expect(201);

      await app
        .request()
        .post('/api/password-setups')
        .send({ token, password: 'another-perfectly-good-one' })
        .expect(400);
    });

    it('stops working when it expires', async () => {
      const { email } = await givenAMember(app, administrator, { activate: false });
      const token = linkTokenSentTo(app, email);

      app.clock.advanceBy(INVITATION_LIFETIME_MS + 1000);

      await app
        .request()
        .post('/api/password-setups')
        .send({ token, password: A_GOOD_PASSWORD })
        .expect(400);
    });

    /**
     * The same words for a link that never existed, one that has expired and one already spent.
     * Which of the three it is would tell somebody holding a guessed token something true.
     */
    it('refuses a link nobody ever issued in the same words as one already used', async () => {
      const { email } = await givenAMember(app, administrator, { activate: false });
      const token = linkTokenSentTo(app, email);
      await app
        .request()
        .post('/api/password-setups')
        .send({ token, password: A_GOOD_PASSWORD })
        .expect(201);

      const spent = await app
        .request()
        .post('/api/password-setups')
        .send({ token, password: A_GOOD_PASSWORD })
        .expect(400);
      const invented = await app
        .request()
        .post('/api/password-setups')
        .send({ token: 'not-a-token-anybody-issued', password: A_GOOD_PASSWORD })
        .expect(400);

      expect(spent.body).toEqual(invented.body);
    });
  });

  describe('resetting a forgotten password', () => {
    it('mails a link the member can use to choose a new one', async () => {
      const member = await givenAMember(app, administrator);
      app.emails.clear();

      await app.request().post('/api/password-resets').send({ email: member.email }).expect(202);

      const letter = app.emails.sentTo(member.email).at(-1);
      expect(letter?.subject).toBe('Setting a new Ricambi password');

      const agent = app.agent();
      await agent
        .post('/api/password-setups')
        .send({ token: linkTokenSentTo(app, member.email), password: 'a-brand-new-passphrase' })
        .expect(201);
      await agent.get('/api/models').expect(200);
    });

    it('says the link is a reset rather than an invitation', async () => {
      const member = await givenAMember(app, administrator);
      app.emails.clear();
      await app.request().post('/api/password-resets').send({ email: member.email }).expect(202);

      const response = await app
        .request()
        .post('/api/password-setups/inspect')
        .send({ token: linkTokenSentTo(app, member.email) })
        .expect(200);

      expect(response.body.purpose).toBe('password-reset');
    });

    /** Two hours, not three weeks: a reset arrives because somebody asked a minute ago. */
    it('expires far sooner than an invitation does', async () => {
      const member = await givenAMember(app, administrator);
      app.emails.clear();
      await app.request().post('/api/password-resets').send({ email: member.email }).expect(202);
      const token = linkTokenSentTo(app, member.email);

      app.clock.advanceBy(PASSWORD_RESET_LIFETIME_MS + 1000);

      await app
        .request()
        .post('/api/password-setups')
        .send({ token, password: 'a-brand-new-passphrase' })
        .expect(400);
    });

    /**
     * **Every other session dies.** This is what somebody resetting a password because of a
     * shared computer came here to do, and a reset that left that computer signed in would be
     * the exact opposite of it.
     */
    it('signs out every browser that was already signed in as that member', async () => {
      const member = await givenAMember(app, administrator);
      await member.agent.get('/api/models').expect(200);

      app.emails.clear();
      await app.request().post('/api/password-resets').send({ email: member.email }).expect(202);
      await app
        .request()
        .post('/api/password-setups')
        .send({ token: linkTokenSentTo(app, member.email), password: 'a-brand-new-passphrase' })
        .expect(201);

      await member.agent.get('/api/models').expect(401);
    });

    it('leaves the old password working while the link is merely outstanding', async () => {
      const member = await givenAMember(app, administrator);
      app.emails.clear();

      await app.request().post('/api/password-resets').send({ email: member.email }).expect(202);

      await app
        .request()
        .post('/api/session')
        .send({ email: member.email, password: A_GOOD_PASSWORD })
        .expect(201);
    });

    /** Somebody else's inbox is not a thing a stranger gets to fill by pressing a button. */
    it('does not send a second letter to the same address moments later', async () => {
      const member = await givenAMember(app, administrator);
      app.emails.clear();

      await app.request().post('/api/password-resets').send({ email: member.email }).expect(202);
      await app.request().post('/api/password-resets').send({ email: member.email }).expect(202);

      expect(app.emails.sentTo(member.email)).toHaveLength(1);

      app.clock.advanceBy(3 * 60 * 1000);
      await app.request().post('/api/password-resets').send({ email: member.email }).expect(202);
      expect(app.emails.sentTo(member.email)).toHaveLength(2);
    });

    /** Somebody who never activated asking for a reset gets one, and it activates them. */
    it('works for somebody who never redeemed their invitation', async () => {
      const { email } = await givenAMember(app, administrator, { activate: false });
      app.emails.clear();

      await app.request().post('/api/password-resets').send({ email }).expect(202);

      const agent = app.agent();
      await agent
        .post('/api/password-setups')
        .send({ token: linkTokenSentTo(app, email), password: A_GOOD_PASSWORD })
        .expect(201);
      await agent.get('/api/models').expect(200);
    });
  });
});

/**
 * The storage itself, away from HTTP — the one thing about a password worth a test that a
 * request cannot make: that what is written can be read back, under a cost nobody used to write
 * it. Raising the work factor years from now must not lock the membership out.
 */
describe('how a password is stored', () => {
  it('reads back under a cost it was not written under, because the parameters travel with it', async () => {
    const cheap = createPasswordHasher(TEST_PASSWORD_COST);
    const stored = await cheap.hash(A_GOOD_PASSWORD);

    const dearer = createPasswordHasher(STANDARD_COST);
    expect(await dearer.verify(A_GOOD_PASSWORD, stored)).toBe(true);
    expect(await dearer.verify('not the password', stored)).toBe(false);
  });

  it('never stores the password itself, nor the same hash twice for the same one', async () => {
    const hasher = createPasswordHasher(TEST_PASSWORD_COST);

    const first = await hasher.hash(A_GOOD_PASSWORD);
    const second = await hasher.hash(A_GOOD_PASSWORD);

    expect(first).not.toContain(A_GOOD_PASSWORD);
    // Salted, so two members who chose the same password do not look alike in the table.
    expect(first).not.toBe(second);
    expect(await hasher.verify(A_GOOD_PASSWORD, second)).toBe(true);
  });

  it('answers no rather than throwing when what was stored is rubbish', async () => {
    const hasher = createPasswordHasher(TEST_PASSWORD_COST);

    expect(await hasher.verify(A_GOOD_PASSWORD, '')).toBe(false);
    expect(await hasher.verify(A_GOOD_PASSWORD, 'not-a-stored-hash')).toBe(false);
    expect(await hasher.verify(A_GOOD_PASSWORD, 'scrypt$0$0$0$$')).toBe(false);
  });
});
