import type { RosterEntry } from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { UnconfiguredEmailSender } from '../src/platform/email.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A_GOOD_PASSWORD, givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * The roster: who the Club has, and the two things an Administrator does about it.
 *
 * The question every one of these is really about is **"I paid, why can't I get in"** (story
 * 124). It has three ordinary answers and none of them is a fault, so the screen has to be able
 * to tell them apart without anybody opening a database.
 */
describe('the roster', () => {
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

  describe('adding somebody', () => {
    it('records their name, address and Paid-through, and invites them in the same breath', async () => {
      const response = await administrator
        .post('/api/roster')
        .send({ name: 'Giulia Rossi', email: 'giulia@club.example', paidThrough: '2026-12-31' })
        .expect(201);

      expect(response.body.member).toMatchObject({
        name: 'Giulia Rossi',
        email: 'giulia@club.example',
        role: 'member',
        paidThrough: '2026-12-31',
      });

      // Adding somebody who is never told is a row that says "invited" and has invited nobody.
      const [letter] = app.emails.sentTo('giulia@club.example');
      expect(letter?.subject).toBe('Your Ricambi invitation');
      expect(letter?.text).toContain('/set-password?token=');
    });

    it('treats one address as one person, whatever case it was typed in', async () => {
      await administrator
        .post('/api/roster')
        .send({ name: 'Giulia Rossi', email: 'Giulia@Club.Example', paidThrough: '2026-12-31' })
        .expect(201);

      const again = await administrator
        .post('/api/roster')
        .send({ name: 'G Rossi', email: 'giulia@club.example', paidThrough: '2027-12-31' })
        .expect(409);

      expect(again.body.error.message).toMatch(/already on the roster/);
    });

    it('refuses a date the archive cannot read, rather than inventing one', async () => {
      await administrator
        .post('/api/roster')
        .send({ name: 'Giulia Rossi', email: 'giulia@club.example', paidThrough: 'next year' })
        .expect(400);
    });

    /**
     * **Nothing on this request could set a password**, and that is the point rather than an
     * omission (story 3). The member chooses one from the link, and an Administrator who wanted
     * to set one for them has no field to put it in.
     */
    it('never accepts a password from whoever is adding the person', async () => {
      const response = await administrator
        .post('/api/roster')
        .send({
          name: 'Giulia Rossi',
          email: 'giulia@club.example',
          paidThrough: '2026-12-31',
          password: 'one-the-administrator-chose',
        })
        .expect(201);

      // The password went nowhere: the member still cannot sign in with it.
      await app
        .request()
        .post('/api/session')
        .send({ email: 'giulia@club.example', password: 'one-the-administrator-chose' })
        .expect(401);

      expect(response.body.member).not.toHaveProperty('password');
      expect(response.body.member).not.toHaveProperty('passwordHash');
    });
  });

  /**
   * The e-mail sender is an external edge, and the ordinary way it fails on a laptop is that
   * nobody configured one. What must not happen then is a 500: the Account and its Membership are
   * already written, so an Administrator who retried would be told the address is already taken.
   */
  describe('when the invitation cannot be sent', () => {
    let refusing: TestApp;

    beforeAll(async () => {
      // The sender itself, not the configuration: this seam always injects the capture, so
      // what makes a send fail here is being handed one that refuses — which is exactly what an
      // unconfigured environment is handed in production.
      refusing = await startTestApp({ emailSender: new UnconfiguredEmailSender() });
    });

    afterAll(async () => {
      await refusing.close();
    });

    it('still puts them on the roster, and says exactly that', async () => {
      const boss = (await givenAnAdministrator(refusing)).agent;

      const response = await boss
        .post('/api/roster')
        .send({ name: 'Giulia Rossi', email: 'giulia@club.example', paidThrough: '2026-12-31' })
        .expect(502);

      expect(response.body.error.code).toBe('invitation_not_sent');
      expect(response.body.error.message).toMatch(/is on the roster/);

      // On the roster, invited, with no outstanding link — and one press away from a fresh one.
      const listed = await find(boss, undefined, 'giulia@club.example');
      expect(listed).toMatchObject({ standing: 'invited', invitationSentAt: null });
    });
  });

  describe('invited, activated and lapsed', () => {
    it('says "invited" for somebody who has never chosen a password', async () => {
      const { entry } = await givenAMember(app, administrator, { activate: false });

      const listed = await find(administrator, entry.id);
      expect(listed).toMatchObject({ standing: 'invited', activatedAt: null });
      expect(listed.invitationSentAt).not.toBeNull();
      expect(listed.invitationExpiresAt).not.toBeNull();
    });

    it('says "active" once they have', async () => {
      const { entry } = await givenAMember(app, administrator);

      const listed = await find(administrator, entry.id);
      expect(listed.standing).toBe('active');
      expect(listed.activatedAt).not.toBeNull();
      // The invitation was spent redeeming it, so there is no outstanding link to report.
      expect(listed.invitationSentAt).toBeNull();
    });

    it('says "lapsed" the day after the term runs out, without anybody doing anything', async () => {
      const { entry } = await givenAMember(app, administrator, { paidThrough: '2026-01-31' });

      expect((await find(administrator, entry.id)).standing).toBe('active');

      app.clock.setTo(new Date('2026-02-01T09:00:00.000Z'));
      expect((await find(administrator, entry.id)).standing).toBe('lapsed');
    });

    /** The last day the term covers still reads. A member does not lose the day they paid for. */
    it('is still active on the Paid-through date itself', async () => {
      const { entry } = await givenAMember(app, administrator, { paidThrough: '2026-01-31' });

      app.clock.setTo(new Date('2026-01-31T23:00:00.000Z'));
      expect((await find(administrator, entry.id)).standing).toBe('active');
    });

    /**
     * Lapsed wins over invited, because it is the one that stops them reading: somebody who never
     * chose a password *and* whose term has run out cannot get in for both reasons, and the money
     * is what an Administrator has to fix first.
     *
     * **Which is why `activatedAt` is on the row beside it.** One word cannot carry two problems,
     * and an Administrator who records this person's payment has fixed only half of it — the
     * screen has to be able to say so without anybody opening a database.
     */
    it('says "lapsed" for somebody who never activated, and still reports that they never did', async () => {
      const { entry } = await givenAMember(app, administrator, {
        paidThrough: '2026-01-31',
        activate: false,
      });

      app.clock.setTo(new Date('2026-02-01T09:00:00.000Z'));

      const listed = await find(administrator, entry.id);
      expect(listed.standing).toBe('lapsed');
      expect(listed.activatedAt).toBeNull();
    });
  });

  describe('sending the invitation again', () => {
    it('sends a fresh link to somebody who missed the first one', async () => {
      const { entry, email } = await givenAMember(app, administrator, { activate: false });
      const first = tokenIn(app.emails.sentTo(email)[0]?.text);

      await administrator.post(`/api/roster/${entry.id}/invitation`).expect(201);

      const second = tokenIn(app.emails.sentTo(email)[1]?.text);
      expect(second).not.toBe(first);
    });

    /**
     * **And the first one stops working.** Re-sending must not leave two live keys to one account
     * lying in two inboxes — an invitation forwarded months ago is exactly what expiry and single
     * use are for (story 4).
     */
    it('kills the link it replaces', async () => {
      const { entry, email } = await givenAMember(app, administrator, { activate: false });
      const first = tokenIn(app.emails.sentTo(email)[0]?.text);

      await administrator.post(`/api/roster/${entry.id}/invitation`).expect(201);

      await app
        .request()
        .post('/api/password-setups')
        .send({ token: first, password: A_GOOD_PASSWORD })
        .expect(400);
    });
  });

  describe('recording a payment received by bank transfer', () => {
    it('moves the Paid-through date, and access comes back with it', async () => {
      const member = await givenAMember(app, administrator, { paidThrough: '2026-01-31' });
      app.clock.setTo(new Date('2026-02-05T09:00:00.000Z'));

      // Lapsed: signed in, and refused the archive.
      await member.agent.get('/api/models').expect(403);

      const recorded = await administrator
        .post(`/api/roster/${member.entry.id}/payments`)
        .send({
          amount: '45.00',
          currency: 'EUR',
          receivedOn: '2026-02-04',
          reference: 'Ricambi 2026 Rossi',
          paidThrough: '2027-01-31',
        })
        .expect(201);

      expect(recorded.body.member).toMatchObject({ standing: 'active', paidThrough: '2027-01-31' });

      // **No account surgery whatsoever** (story 10): the same session that was refused works.
      await member.agent.get('/api/models').expect(200);
    });

    it('refuses a payment that does not move the date forward', async () => {
      const { entry } = await givenAMember(app, administrator, { paidThrough: '2026-12-31' });

      const response = await administrator
        .post(`/api/roster/${entry.id}/payments`)
        .send({
          amount: '45.00',
          currency: 'EUR',
          receivedOn: '2026-01-10',
          reference: null,
          paidThrough: '2026-06-30',
        })
        .expect(400);

      expect(response.body.error.message).toMatch(/already runs to 2026-12-31/);
    });

    it('refuses money that arrived on a day that has not happened', async () => {
      const { entry } = await givenAMember(app, administrator);

      await administrator
        .post(`/api/roster/${entry.id}/payments`)
        .send({
          amount: '45.00',
          currency: 'EUR',
          receivedOn: '2027-01-10',
          reference: null,
          paidThrough: '2027-12-31',
        })
        .expect(400);
    });

    /** A term granted for nothing is a thing a club does. A figure with no currency is not. */
    it('accepts a term granted with no money against it', async () => {
      const { entry } = await givenAMember(app, administrator);

      await administrator
        .post(`/api/roster/${entry.id}/payments`)
        .send({
          amount: null,
          currency: 'EUR',
          receivedOn: '2026-01-10',
          reference: null,
          paidThrough: '2027-12-31',
        })
        .expect(201);
    });
  });

  describe('appointing an Editor', () => {
    it('hands content responsibility on, and takes it back', async () => {
      const member = await givenAMember(app, administrator);

      // A plain Member may read the archive and may not change it.
      await member.agent.get('/api/models').expect(200);
      await member.agent.post('/api/models').send({ brand: 'Iso', name: 'Grifo' }).expect(403);

      await administrator
        .patch(`/api/roster/${member.entry.id}`)
        .send({ role: 'editor' })
        .expect(200);
      await member.agent.post('/api/models').send({ brand: 'Iso', name: 'Grifo' }).expect(201);

      await administrator
        .patch(`/api/roster/${member.entry.id}`)
        .send({ role: 'member' })
        .expect(200);
      await member.agent.post('/api/models').send({ brand: 'Iso', name: 'Fidia' }).expect(403);
    });
  });

  describe('who may keep it', () => {
    it('is refused to a member who is not an Administrator', async () => {
      const member = await givenAMember(app, administrator);

      await member.agent.get('/api/roster').expect(403);
      await member.agent
        .post('/api/roster')
        .send({ name: 'Somebody', email: 'them@club.example', paidThrough: '2027-12-31' })
        .expect(403);
    });

    it('is refused to an Editor, who edits the archive rather than the Club', async () => {
      const editor = await givenAMember(app, administrator, { role: 'editor' });

      await editor.agent.get('/api/roster').expect(403);
    });

    it('is refused to a browser that has not signed in at all', async () => {
      await app.request().get('/api/roster').expect(401);
    });

    /**
     * **An Administrator whose own Membership has lapsed still keeps the roster**, deliberately.
     * Administering the Club is not reading the archive, and the alternative is a treasurer
     * locked out of the one screen that could record their own payment.
     */
    it('is kept by a lapsed Administrator, who is still refused the archive', async () => {
      const boss = await givenAnAdministrator(app, {
        email: 'treasurer@club.example',
        paidThrough: '2026-01-31',
      });

      app.clock.setTo(new Date('2026-02-05T09:00:00.000Z'));

      await boss.agent.get('/api/roster').expect(200);
      await boss.agent.get('/api/models').expect(403);
    });
  });
});

async function find(
  administrator: TestAgent,
  accountId?: string,
  email?: string,
): Promise<RosterEntry> {
  const response = await administrator.get('/api/roster').expect(200);
  const entry = (response.body.members as RosterEntry[]).find((row) =>
    accountId === undefined ? row.email === email : row.id === accountId,
  );
  expect(entry, `nobody on the roster is ${accountId ?? email}`).toBeDefined();
  return entry as RosterEntry;
}

function tokenIn(text: string | undefined): string {
  return decodeURIComponent(/\/set-password\?token=(\S+)/.exec(text ?? '')?.[1] ?? '');
}
