import type { ReminderPlan } from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runReminders } from '../src/composition/reminder-run.js';
import { InMemoryEmailSender } from '../src/platform/email.js';
import { UnconfiguredPaymentProvider } from '../src/platform/payments.js';
import { givenAMember, givenAnAdministrator, type RecruitedMember } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * Renewal reminders (issue #3): **one e-mail before a Membership runs out, carrying everything
 * needed to pay — once.**
 *
 * The risk in this is not the feature, it is the first day. A roster arrives with dates nobody
 * has checked, some of them inside the reminder window, and a nightly job would then demand
 * money from the whole membership on the Club's behalf. So most of what is asserted here is
 * about what does *not* go out: nothing while it is switched off, nothing twice, nothing for a
 * term too short to have had a reminder, and nothing at all until an Administrator has been able
 * to read exactly who would be written to.
 *
 * The nightly job is called the way `main.ts` calls it, with the application's own database,
 * clock and mail — which here is the in-memory transport, so "exactly one" is a count.
 */

/** A production environment that has said reminders may be sent. Nothing else may say so. */
const SENDING = {
  ENVIRONMENT_MODE: 'production',
  PUBLIC_URL: 'https://ricambi.example',
  REMINDERS_ENABLED: 'true',
};

/**
 * A mailbox this suite can count, which says of itself that it delivers — as the real transport
 * of a real deployment does, and as nothing else in this suite may.
 */
class DeliveringMailbox extends InMemoryEmailSender {
  override readonly reachesRealPeople = true;
}

const CLUB = {
  fee: '45,00',
  currency: 'EUR',
  bankAccountHolder: 'An Invented Club e.V.',
  bankName: 'A Bank',
  iban: 'DE11 1111 1111 1111 1111 11',
  bic: 'ABCDEFGH',
  paymentReference: 'Ricambi {year} {name}',
  reminderText: 'Your membership of the Club is about to run out.',
  officeEmail: 'office@club.example',
};

describe('Renewal reminders', () => {
  let app: TestApp;
  let administrator: RecruitedMember;
  /** Paid up to the last day of 2026, so her reminder is due on the first of December. */
  let elena: RecruitedMember;

  beforeAll(async () => {
    app = await startTestApp({ env: SENDING, emails: new DeliveringMailbox() });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    administrator = await givenAnAdministrator(app, { paidThrough: '2060-12-31' });
    await administrator.agent
      .patch('/api/club')
      .send({ ...CLUB, remindersOn: true })
      .expect(200);
    elena = await givenAMember(app, administrator.agent, {
      name: 'Elena Moretti',
      paidThrough: '2026-12-31',
    });
    app.emails.clear();
  });

  /** The nightly job, as the running application calls it. */
  function nightly() {
    return runReminders({
      db: app.db,
      clock: app.clock,
      logger: app.logger,
      emailSender: app.emails,
      paymentProvider: new UnconfiguredPaymentProvider(),
      config: app.config,
    });
  }

  async function on(day: string): Promise<void> {
    app.clock.setTo(new Date(`${day}T03:00:00.000Z`));
    administrator.agent = await app.memberAgent(administrator);
  }

  async function plan(agent: TestAgent = administrator.agent): Promise<ReminderPlan> {
    const response = await agent.get('/api/reminders').expect(200);
    return response.body;
  }

  function reminders(member: RecruitedMember = elena) {
    return app.emails.sentTo(member.email);
  }

  /**
   * Thirty days before the Paid-through, and not a day earlier. The letter is the whole of what
   * a member needs: the amount, where to send it, the words to write on the transfer and the
   * date it has to arrive by — all of it the Club's own, read from the Club's record.
   */
  it('sends one, thirty days before, with everything needed to pay', async () => {
    await on('2026-11-30');
    await nightly();
    expect(reminders()).toHaveLength(0);

    await on('2026-12-01');
    expect(await nightly()).toEqual({ reminders: 1, digest: false });

    const [letter] = reminders();
    expect(letter?.subject).toBe('Your Club membership runs to 31 December 2026');
    for (const fact of [
      'Hello Elena Moretti,',
      'Your membership of the Club is about to run out.',
      '45.00 EUR',
      'An Invented Club e.V.',
      'DE11 1111 1111 1111 1111 11',
      'ABCDEFGH',
      'Ricambi 2027 Elena Moretti',
      '31 December 2026',
      'office@club.example',
    ]) {
      expect(letter?.text, `the letter does not say "${fact}"`).toContain(fact);
    }
  });

  /** In the platform's name: it says who is writing, and on whose behalf. */
  it('is sent in the platform’s own name, on the Club’s behalf', async () => {
    await on('2026-12-01');
    await nightly();

    expect(reminders()[0]?.text).toMatch(/sent by Ricambi.*on the Club’s behalf/s);
  });

  /**
   * **At most one per term**, and the term remembers. A second night, a retry, a manual run on
   * top of the nightly one: the Membership says it has been done, and nothing goes out.
   */
  it('never sends a second for the same term, however often the job runs', async () => {
    await on('2026-12-01');
    await nightly();
    await nightly();
    await administrator.agent.post('/api/reminders/run').expect(200);
    await on('2026-12-15');
    await nightly();

    expect(reminders()).toHaveLength(1);
  });

  /** A renewal is a new term, and a new term is owed its own reminder a year later. */
  it('sends another for the next term, once a renewal has started one', async () => {
    await on('2026-12-01');
    await nightly();
    await administrator.agent
      .post(`/api/roster/${elena.entry.id}/payments`)
      .send({
        amount: '45',
        currency: 'EUR',
        receivedOn: '2026-12-01',
        reference: null,
        paidThrough: '2027-12-31',
      })
      .expect(201);

    await on('2027-11-30');
    await nightly();
    expect(reminders()).toHaveLength(1);

    await on('2027-12-01');
    await nightly();
    expect(reminders()).toHaveLength(2);
    expect(reminders()[1]?.text).toContain('Ricambi 2028 Elena Moretti');
  });

  /**
   * **A backfilled Membership must not receive a demand.** A term granted less than the window
   * before it ends never had a moment at which a reminder was due, so it gets none — and the
   * preview says who was passed over, and why.
   */
  it('sends none for a term shorter than the reminder window', async () => {
    await on('2026-12-10');
    const late = await givenAMember(app, administrator.agent, {
      name: 'Late Arrival',
      paidThrough: '2026-12-31',
    });
    app.emails.clear();

    await nightly();

    expect(reminders(late)).toHaveLength(0);
    expect((await plan()).skipped).toContainEqual({
      accountId: late.entry.id,
      name: 'Late Arrival',
      paidThrough: '2026-12-31',
      why: 'short-term',
    });
  });

  /** A Membership that has already run out is past reminding: that is the treasurer's list. */
  it('sends none for a Membership that has already run out', async () => {
    await on('2027-01-05');

    expect(await nightly()).toMatchObject({ reminders: 0 });
    expect(reminders()).toHaveLength(0);
  });

  /** The letter is the Club's to word and to address. Changing the record changes the letter. */
  it('says what the Club’s record says on the day it is sent', async () => {
    await administrator.agent
      .patch('/api/club')
      .send({
        iban: 'DE22 2222 2222 2222 2222 22',
        reminderText: 'Bitte denken Sie an den Beitrag.',
      })
      .expect(200);

    await on('2026-12-01');
    await nightly();

    expect(reminders()[0]?.text).toContain('DE22 2222 2222 2222 2222 22');
    expect(reminders()[0]?.text).toContain('Bitte denken Sie an den Beitrag.');
  });

  /**
   * A member whose letter could not be sent is not marked as written to. The next night tries
   * again, and still sends one.
   */
  it('tries again the next night for somebody whose letter could not be sent', async () => {
    await on('2026-12-01');
    const send = app.emails.send.bind(app.emails);
    app.emails.send = async () => {
      throw new Error('The mail server is not answering.');
    };
    expect(await nightly()).toMatchObject({ reminders: 0 });
    app.emails.send = send;

    await on('2026-12-02');
    await nightly();

    expect(reminders()).toHaveLength(1);
  });

  describe('the preview', () => {
    /**
     * **Exactly who would be written to, before anything is switched on.** The same reading the
     * job does: who is due tonight, who becomes due in the coming window and on which day, and
     * the letter as the first of them would get it. Reading it sends nothing and marks nothing.
     */
    it('names who is due and who is about to be, and shows the letter, without sending', async () => {
      const dario = await givenAMember(app, administrator.agent, {
        name: 'Dario Lanza',
        paidThrough: '2027-01-20',
      });
      app.emails.clear();
      await on('2026-12-05');

      const preview = await plan();

      expect(preview).toMatchObject({
        asOf: '2026-12-05',
        windowDays: 30,
        sending: { environmentAllows: true, switchedOn: true, canBePaid: true },
        due: [
          {
            accountId: elena.entry.id,
            name: 'Elena Moretti',
            email: elena.email,
            paidThrough: '2026-12-31',
            sendsOn: '2026-12-01',
            reference: 'Ricambi 2027 Elena Moretti',
          },
        ],
        upcoming: [{ accountId: dario.entry.id, paidThrough: '2027-01-20', sendsOn: '2026-12-21' }],
      });
      expect(preview.letter?.text).toContain('Hello Elena Moretti,');
      expect(app.emails.sent).toHaveLength(0);

      // And having been read, nothing is any different: she is still due, and still gets one.
      await nightly();
      expect(reminders()).toHaveLength(1);
    });

    it('is an Administrator’s, like the roster it reads', async () => {
      await elena.agent.get('/api/reminders').expect(403);
      await elena.agent.post('/api/reminders/run').expect(403);
      await app.request().get('/api/reminders').expect(401);
    });
  });

  describe('run by hand', () => {
    it('sends what is due now, rather than waiting for the night', async () => {
      await on('2026-12-01');

      const ran = await administrator.agent.post('/api/reminders/run').expect(200);

      expect(ran.body).toEqual({ reminders: 1, digest: false });
      expect(reminders()).toHaveLength(1);
    });
  });

  describe('while it is switched off', () => {
    /**
     * **Off is the Administrator's switch**, and it starts off. The preview still says who would
     * be written to — that is what it is for — and neither the night nor a press sends anything.
     */
    it('sends nothing, by night or by hand, and says why', async () => {
      await administrator.agent.patch('/api/club').send({ remindersOn: false }).expect(200);
      await on('2026-12-01');

      expect(await nightly()).toEqual({ reminders: 0, digest: false });
      const refused = await administrator.agent.post('/api/reminders/run').expect(409);

      expect(refused.body.error.message).toMatch(/switched off/);
      expect(app.emails.sent).toHaveLength(0);
      expect(await plan()).toMatchObject({
        sending: { environmentAllows: true, switchedOn: false },
        due: [{ accountId: elena.entry.id }],
      });
    });

    it('starts switched off, for a Club nobody has configured', async () => {
      await app.reset();
      administrator = await givenAnAdministrator(app, { paidThrough: '2060-12-31' });

      expect(await plan()).toMatchObject({
        sending: { switchedOn: false, canBePaid: false },
      });
    });

    /** A reminder nobody can act on is a demand with no address on it. */
    it('sends nothing while the Club has not said where the money goes', async () => {
      await administrator.agent.patch('/api/club').send({ iban: '' }).expect(200);
      await on('2026-12-01');

      expect(await nightly()).toEqual({ reminders: 0, digest: false });
      const refused = await administrator.agent.post('/api/reminders/run').expect(409);
      expect(refused.body.error.message).toMatch(/where to send it/);
    });
  });

  /**
   * The treasurer's digest: who is about to run out and who just has, with the reference to
   * look for on the statement. The same job, the same data and the same switch.
   */
  describe('the treasurer’s digest', () => {
    let lapsed: RecruitedMember;

    beforeEach(async () => {
      lapsed = await givenAMember(app, administrator.agent, {
        name: 'Franco Bianchi',
        paidThrough: '2026-11-20',
      });
      await administrator.agent
        .patch('/api/club')
        .send({ treasurerEmail: 'treasurer@club.example' })
        .expect(200);
      app.emails.clear();
    });

    function digests() {
      return app.emails.sentTo('treasurer@club.example');
    }

    it('names who is running out and who has lapsed, with the reference to expect', async () => {
      await on('2026-12-05');

      expect(await nightly()).toMatchObject({ digest: true });

      const [digest] = digests();
      expect(digest?.subject).toBe('Club memberships: 1 running out, 1 lapsed');
      expect(digest?.text).toContain('Elena Moretti');
      expect(digest?.text).toContain('2026-12-31');
      expect(digest?.text).toContain('Ricambi 2027 Elena Moretti');
      expect(digest?.text).toContain('Franco Bianchi');
      expect(digest?.text).toContain('2026-11-20');
      // Paid up for decades, and so not on either list.
      expect(digest?.text).not.toContain('An Administrator');
    });

    it('goes out weekly, not nightly', async () => {
      await on('2026-12-05');
      await nightly();
      await on('2026-12-06');
      await nightly();
      await on('2026-12-11');
      await nightly();
      expect(digests()).toHaveLength(1);

      await on('2026-12-12');
      await nightly();
      expect(digests()).toHaveLength(2);
    });

    it('is not sent when there is nobody to tell the treasurer about', async () => {
      await on('2026-06-01');

      expect(await nightly()).toMatchObject({ digest: false });
      expect(digests()).toHaveLength(0);
    });

    it('is covered by the same switch as the reminders', async () => {
      await administrator.agent.patch('/api/club').send({ remindersOn: false }).expect(200);
      await on('2026-12-05');

      await nightly();

      expect(digests()).toHaveLength(0);
    });

    /** The same lists on a screen, so the treasurer does not depend on an e-mail arriving. */
    it('is also readable in the interface, sent or not', async () => {
      await on('2026-12-05');

      const { digest } = await plan();

      expect(digest).toMatchObject({
        treasurerEmail: 'treasurer@club.example',
        lastSentOn: null,
        runningOut: [
          {
            name: 'Elena Moretti',
            paidThrough: '2026-12-31',
            reference: 'Ricambi 2027 Elena Moretti',
            renewsItself: false,
          },
        ],
        lapsed: [{ name: lapsed.entry.name, paidThrough: '2026-11-20' }],
      });
      // And the digest itself, as it would be sent — readable without anything being sent.
      expect(digest.letter?.subject).toBe('Club memberships: 1 running out, 1 lapsed');
    });

    /**
     * The reference to look for is the one the member was given. A term that ended in
     * November was reminded to pay for the year after; lapsing does not change what they
     * were told to write.
     */
    it('expects the reference the reminder gave, after the Membership has lapsed too', async () => {
      await on('2026-12-05');

      const { digest } = await plan();

      expect(digest.lapsed).toMatchObject([{ reference: 'Ricambi 2027 Franco Bianchi' }]);
    });
  });
});

/**
 * **Allowed is not the same as able.** A production system that has said reminders may be sent,
 * but whose mail is only captured, would otherwise mark every term as reminded while the
 * letters went nowhere — and a term is only ever reminded once.
 */
describe('Where reminders are allowed and e-mail reaches nobody', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp({ env: SENDING });
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends nothing and marks nobody, so the reminder is still owed once e-mail works', async () => {
    await app.reset();
    const administrator = await givenAnAdministrator(app, { paidThrough: '2060-12-31' });
    await administrator.agent
      .patch('/api/club')
      .send({ ...CLUB, remindersOn: true })
      .expect(200);
    const elena = await givenAMember(app, administrator.agent, { paidThrough: '2026-03-31' });
    app.emails.clear();
    app.clock.setTo(new Date('2026-03-05T03:00:00.000Z'));
    administrator.agent = await app.memberAgent(administrator);

    await administrator.agent.post('/api/reminders/run').expect(409);
    const preview = await administrator.agent.get('/api/reminders').expect(200);

    expect(app.emails.sent).toHaveLength(0);
    expect(preview.body).toMatchObject({
      sending: { environmentAllows: false },
      due: [{ accountId: elena.entry.id }],
    });
  });
});

/**
 * **Per environment, and off by default.** An environment that has not said reminders may be
 * sent sends none, whatever an Administrator switches on — which is every laptop and every
 * practice system, since only a production environment is allowed to say so at all.
 */
describe('Where the environment has not allowed reminders', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends nothing even with the Administrator’s switch on, and the preview still works', async () => {
    await app.reset();
    const administrator = await givenAnAdministrator(app, { paidThrough: '2060-12-31' });
    await administrator.agent
      .patch('/api/club')
      .send({ ...CLUB, remindersOn: true })
      .expect(200);
    const elena = await givenAMember(app, administrator.agent, { paidThrough: '2026-03-31' });
    app.emails.clear();
    app.clock.setTo(new Date('2026-03-05T03:00:00.000Z'));
    administrator.agent = await app.memberAgent(administrator);

    const ran = await runReminders({
      db: app.db,
      clock: app.clock,
      logger: app.logger,
      emailSender: app.emails,
      paymentProvider: new UnconfiguredPaymentProvider(),
      config: app.config,
    });
    const refused = await administrator.agent.post('/api/reminders/run').expect(409);
    const preview = await administrator.agent.get('/api/reminders').expect(200);

    expect(ran).toEqual({ reminders: 0, digest: false });
    expect(refused.body.error.message).toMatch(/this environment/);
    expect(app.emails.sent).toHaveLength(0);
    expect(preview.body).toMatchObject({
      sending: { environmentAllows: false, switchedOn: true },
      due: [{ accountId: elena.entry.id }],
    });
  });
});
