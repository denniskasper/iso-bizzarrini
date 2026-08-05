import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * What a member is told when their Membership has run out.
 *
 * **This is the address that makes "authenticate, then authorise" worth the trouble.** A lapsed
 * member has proved who they are, so nothing here is a disclosure: they can be handed the amount,
 * the Club's bank details and the exact words to write on the transfer, and go and pay, instead
 * of bouncing off a refusal and telephoning somebody (stories 8 and 9).
 */
describe('the renewal a lapsed member is shown', () => {
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
    await administrator
      .patch('/api/club')
      .send({
        fee: '45.00',
        currency: 'EUR',
        bankAccountHolder: 'Iso Bizzarrini Club',
        bankName: 'A Bank',
        iban: 'DE00 0000 0000 0000 0000 00',
        bic: 'ABCDEFGH',
        paymentReference: 'Ricambi {year} {name}',
        officeEmail: 'office@club.example',
      })
      .expect(200);
  });

  it('carries the amount, where to send it and who to ask', async () => {
    const member = await givenAMember(app, administrator, {
      name: 'Elena Moretti',
      paidThrough: '2025-12-31',
    });

    const response = await member.agent.get('/api/renewal').expect(200);

    expect(response.body.renewal).toMatchObject({
      fee: '45.00',
      currency: 'EUR',
      bankAccountHolder: 'Iso Bizzarrini Club',
      bankName: 'A Bank',
      iban: 'DE00 0000 0000 0000 0000 00',
      bic: 'ABCDEFGH',
      officeEmail: 'office@club.example',
    });
  });

  /**
   * **The reference arrives written out, not as a template.** Asking somebody standing in a
   * garage to substitute their own name into `{name}` is asking for a transfer the treasurer
   * cannot match to anybody — which is the failure this whole screen exists to prevent.
   */
  it('writes the payment reference out in the words the member should use', async () => {
    const member = await givenAMember(app, administrator, {
      name: 'Elena Moretti',
      paidThrough: '2025-12-31',
    });

    const response = await member.agent.get('/api/renewal').expect(200);

    // The clock says 2026, and the term they are buying is the one running now.
    expect(response.body.renewal.reference).toBe('Ricambi 2026 Elena Moretti');
  });

  /** Somebody paid up is buying the year *after* the one they hold, not the one they are in. */
  it('names the following year for a member who is renewing early', async () => {
    const member = await givenAMember(app, administrator, {
      name: 'Clara Weiss',
      paidThrough: '2026-12-31',
    });

    const response = await member.agent.get('/api/renewal').expect(200);

    expect(response.body.renewal.reference).toBe('Ricambi 2027 Clara Weiss');
  });

  /**
   * A system nobody has configured says so rather than inventing a bank. The screen has to be
   * able to tell a member "the Club has not published its details" instead of a blank IBAN.
   */
  it('reads as an unconfigured association where nobody has filled the Club in', async () => {
    const bare = await startTestApp();
    try {
      const boss = (await givenAnAdministrator(bare)).agent;
      const member = await givenAMember(bare, boss, { name: 'Nobody Yet' });

      const response = await member.agent.get('/api/renewal').expect(200);

      expect(response.body.renewal).toMatchObject({
        fee: '0.00',
        iban: null,
        bankName: null,
        officeEmail: null,
      });
    } finally {
      await bare.close();
    }
  });

  describe('who may read it', () => {
    /** The whole point: the person who cannot read the archive is the person who needs this. */
    it('is readable by a member whose Membership has run out', async () => {
      const member = await givenAMember(app, administrator, { paidThrough: '2025-12-31' });

      await member.agent.get('/api/models').expect(403);
      await member.agent.get('/api/renewal').expect(200);
    });

    it('is readable by a paid-up member too, since a term still runs out', async () => {
      const member = await givenAMember(app, administrator, { paidThrough: '2027-12-31' });

      await member.agent.get('/api/renewal').expect(200);
    });

    /**
     * It carries the Club's bank details, so it is behind the gate like everything else. What it
     * is deliberately *not* behind is a live Membership.
     */
    it('is refused to a browser that has not signed in', async () => {
      await app.request().get('/api/renewal').expect(401);
    });

    /**
     * The reminder text and the screen that edits the Club stay an Administrator's. Widening the
     * Club's own record to every member would hand over more than a member needs in order to pay.
     */
    it('does not carry the Club record itself, which is still an Administrator’s', async () => {
      const member = await givenAMember(app, administrator, { paidThrough: '2025-12-31' });

      await member.agent.get('/api/club').expect(403);

      const response = await member.agent.get('/api/renewal').expect(200);
      expect(response.body.renewal).not.toHaveProperty('reminderText');
      expect(response.body.renewal).not.toHaveProperty('paymentReference');
    });

    /**
     * **The Paid-through is the session's, and is deliberately not here as well.** The same date
     * served from two addresses is two dates free to disagree; what this needs it for is working
     * out which year the member is paying for, and that leaves in the reference.
     */
    it('leaves the date itself to the session, which every screen already holds', async () => {
      const member = await givenAMember(app, administrator, { paidThrough: '2025-12-31' });

      const renewal = await member.agent.get('/api/renewal').expect(200);
      expect(renewal.body.renewal).not.toHaveProperty('paidThrough');

      const session = await member.agent.get('/api/session').expect(200);
      expect(session.body.account).toMatchObject({
        membershipIsLive: false,
        paidThrough: '2025-12-31',
      });
    });
  });

  /**
   * **Lapsing takes the archive away and nothing else** (ticket 15). It is not a suspension, a
   * deletion or a repair job: the Account, the password they chose and everything they have
   * contributed are exactly where they were, which is what makes recording a payment enough.
   */
  it('leaves the Account and the password they chose untouched', async () => {
    const member = await givenAMember(app, administrator, {
      name: 'Elena Moretti',
      paidThrough: '2025-12-31',
    });

    // A fresh browser, signing in from scratch with the password they chose before they lapsed.
    const returning = await app.memberAgent({ email: member.email, password: member.password });
    const session = await returning.get('/api/session').expect(200);

    expect(session.body.account).toMatchObject({
      name: 'Elena Moretti',
      email: member.email,
      role: 'member',
      membershipIsLive: false,
    });
    await returning.get('/api/renewal').expect(200);
  });

  /** Recording a payment restores access with no account surgery whatever (story 10). */
  it('stops standing between them and the archive the moment a payment is recorded', async () => {
    const member = await givenAMember(app, administrator, { paidThrough: '2025-12-31' });
    await member.agent.get('/api/models').expect(403);

    await administrator
      .post(`/api/roster/${member.entry.id}/payments`)
      .send({
        amount: '45.00',
        currency: 'EUR',
        receivedOn: '2026-01-15',
        reference: 'Ricambi 2026 A Member',
        paidThrough: '2026-12-31',
      })
      .expect(201);

    // The same browser, the same cookie, nothing signed out and nothing signed in again.
    await member.agent.get('/api/models').expect(200);
  });
});
