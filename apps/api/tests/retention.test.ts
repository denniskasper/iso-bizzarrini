import type { Contribution, RetentionReport, RosterEntry } from '@ricambi/contracts';
import { eq } from 'drizzle-orm';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type TestAgent from 'supertest/lib/agent.js';
import { runRetentionSweep } from '../src/composition/retention-sweep.js';
import { memberships } from '../src/db/schema.js';
import { UnconfiguredPaymentProvider } from '../src/platform/payments.js';
import { createFileStore } from '../src/storage/file-store.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenPhotographImage, givenTavola } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator, type RecruitedMember } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * Retention and erasure (ADR 0007, stories 131–133): **the personal data goes and the knowledge
 * stays.**
 *
 * A Contribution is personal data and it is also the archive, so neither a member leaving nor a
 * member asking to be forgotten may take what they taught the Club with them. What is asserted
 * here is what the association would have to answer for: that the person can no longer be found,
 * that what they published can, and that the money the Club was paid still has a record.
 */
describe('Erasing a person', () => {
  let app: TestApp;
  let administrator: RecruitedMember;
  let editor: TestAgent;
  let clara: RecruitedMember;
  let dario: RecruitedMember;
  let positionId: string;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();

    administrator = await givenAnAdministrator(app);
    editor = (await givenAMember(app, administrator.agent, { name: 'An Editor', role: 'editor' }))
      .agent;
    clara = await givenAMember(app, administrator.agent, { name: 'Clara Conti' });
    dario = await givenAMember(app, administrator.agent, { name: 'Dario Esposito' });

    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    const tavola = await givenTavola(app.db, model.id, { number: '2' });
    const sheet = await editor
      .post(`/api/tavole/${tavola.id}/positions`)
      .send({ number: '14' })
      .expect(201);
    positionId = sheet.body.positions[0].id;
  });

  async function write(member: RecruitedMember, text: string): Promise<string> {
    const sent = await member.agent
      .post(`/api/positions/${positionId}/contributions`)
      .send({ text })
      .expect(201);
    return sent.body.contribution.id;
  }

  async function publish(contributionId: string): Promise<void> {
    await editor
      .put(`/api/contributions/${contributionId}/decision`)
      .send({ decision: 'publish' })
      .expect(200);
  }

  async function readAs(agent: TestAgent): Promise<Contribution[]> {
    const response = await agent.get(`/api/positions/${positionId}/contributions`).expect(200);
    return response.body.contributions;
  }

  async function roster(): Promise<RosterEntry[]> {
    const response = await administrator.agent.get('/api/roster').expect(200);
    return response.body.members;
  }

  function erase(member: RecruitedMember, agent: TestAgent = administrator.agent) {
    return agent.delete(`/api/roster/${member.entry.id}`);
  }

  /**
   * The whole of ADR 0007 in one press: Clara is gone from the roster, and what she established
   * about the dust shield is still there for Dario to read — under no name at all.
   */
  it('takes the person off the roster and leaves what they published, under no name', async () => {
    const written = await write(clara, 'This is the dust shield. Clara Conti fitted one in 1998.');
    await publish(written);

    await erase(clara).expect(200);

    expect((await roster()).map((member) => member.email)).not.toContain(clara.email);

    const [contribution] = await readAs(dario.agent);
    expect(contribution).toMatchObject({
      id: written,
      authorName: null,
      state: 'published',
      // **Not altered.** Her name is still in the sentence she wrote, and taking it out is an
      // Editor's job on this text rather than something a deletion does to every text at once.
      text: 'This is the dust shield. Clara Conti fitted one in 1998.',
    });
  });

  /**
   * **Only what was published is the archive's.** A Contribution still waiting, or one an Editor
   * discarded, was never shown to anybody: it is the member's own, and it goes with them —
   * the words, the photograph, and the files the photograph was kept in.
   */
  it('removes what nobody had published, pictures and all', async () => {
    const waiting = await write(clara, 'I think this is off a Rivolta, not a Grifo.');
    const attached = await clara.agent
      .post(`/api/contributions/${waiting}/photographs`)
      .set('Content-Type', 'image/jpeg')
      .send(await givenPhotographImage())
      .expect(201);
    const [photograph] = attached.body.contribution.photographs;

    const discarded = await write(clara, 'Ignore my last.');
    await editor
      .put(`/api/contributions/${discarded}/decision`)
      .send({ decision: 'discard' })
      .expect(200);

    const erased = await erase(clara).expect(200);

    expect(erased.body.erased).toMatchObject({ contributionsKept: 0, contributionsRemoved: 2 });
    const queue = await editor.get('/api/contributions/waiting').expect(200);
    expect(queue.body.contributions).toEqual([]);
    await editor.get(photograph.displayUrl).expect(404);
    expect(await readdir(join(app.filesPath, 'photographs'))).toEqual([]);
  });

  /**
   * A published Contribution keeps the pictures that came with it. They are part of what the
   * archive was told, and an Editor published them with the words.
   */
  it('keeps the photographs of what was published', async () => {
    const written = await write(clara, 'The casting mark, on mine.');
    const attached = await clara.agent
      .post(`/api/contributions/${written}/photographs`)
      .set('Content-Type', 'image/jpeg')
      .send(await givenPhotographImage())
      .expect(201);
    const [photograph] = attached.body.contribution.photographs;
    await publish(written);

    await erase(clara).expect(200);

    await dario.agent.get(photograph.displayUrl).expect(200);
  });

  /**
   * **The identification goes**: the session she was signed in with is dead on the next request,
   * her password opens nothing, and the address is free for the Club to add again one day — as
   * a new person, with none of the old one's history.
   */
  it('signs the person out and forgets how they signed in', async () => {
    await erase(clara).expect(200);

    const session = await clara.agent.get('/api/session').expect(200);
    expect(session.body).toEqual({ signedIn: false, account: null });

    await app
      .request()
      .post('/api/session')
      .send({ email: clara.email, password: clara.password })
      .expect(401);

    const again = await givenAMember(app, administrator.agent, {
      name: 'Clara Conti',
      email: clara.email,
    });
    expect(again.entry.id).not.toBe(clara.entry.id);
  });

  /**
   * **What the Club was paid is not erased** — it is kept for the statutory accounting period,
   * and the privacy statement says so rather than promising what the association cannot do.
   * The payment still says who paid it, because one that does not is no use to an auditor; the
   * opening entry, which records no money, is not a payment record and goes with her.
   */
  it('keeps the record of every payment the Club received, and who it was from', async () => {
    await administrator.agent
      .post(`/api/roster/${clara.entry.id}/payments`)
      .send({
        amount: '45,00',
        currency: 'EUR',
        receivedOn: '2026-01-10',
        reference: 'Ricambi 2027 Clara Conti',
        paidThrough: '2027-12-31',
      })
      .expect(201);

    const erased = await erase(clara).expect(200);
    expect(erased.body.erased).toMatchObject({ paymentRecordsKept: 1 });

    // Read from the table, and it is the one place in this file that is: no screen shows a
    // payment record yet, and "the row is still there" is the whole of what is being promised.
    const kept = await app.db.select().from(memberships).where(eq(memberships.amount, 4500));
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      accountId: null,
      payerName: 'Clara Conti',
      currency: 'EUR',
      receivedOn: '2026-01-10',
      reference: 'Ricambi 2027 Clara Conti',
      paidThrough: '2027-12-31',
    });
    expect(await app.db.$count(memberships, eq(memberships.payerName, 'Clara Conti'))).toBe(1);
  });

  /**
   * An Administrator who recorded other people's payments can be erased like anybody else, and
   * the terms they recorded stand: the member paid, whoever it was that wrote it down.
   */
  it('leaves standing the payments an erased Administrator recorded for other people', async () => {
    const treasurer = await givenAMember(app, administrator.agent, {
      name: 'A Treasurer',
      role: 'administrator',
    });
    await treasurer.agent
      .post(`/api/roster/${dario.entry.id}/payments`)
      .send({
        amount: '45',
        currency: 'EUR',
        receivedOn: '2026-01-10',
        reference: null,
        paidThrough: '2027-12-31',
      })
      .expect(201);

    await erase(treasurer).expect(200);

    const entry = (await roster()).find((member) => member.id === dario.entry.id);
    expect(entry).toMatchObject({ paidThrough: '2027-12-31', standing: 'active' });
  });

  describe('is refused', () => {
    it('to an Administrator erasing the Account they are signed in with', async () => {
      const refused = await erase(administrator).expect(409);

      expect(refused.body.error.message).toMatch(/another Administrator/);
      expect((await roster()).map((member) => member.id)).toContain(administrator.entry.id);
    });

    it('to anybody who is not an Administrator', async () => {
      await erase(clara, editor).expect(403);
      await erase(clara, app.request() as unknown as TestAgent).expect(401);

      expect((await roster()).map((member) => member.id)).toContain(clara.entry.id);
    });

    it('for somebody who is not on the roster, which is also what a second press finds', async () => {
      await erase(clara).expect(200);
      await erase(clara).expect(404);
    });
  });
});

/**
 * The retention sweep (story 133): **the rule applied rather than remembered.**
 *
 * Nobody presses anything. The sweep is what the running system does once a day, and it is
 * called here the way `main.ts` calls it — a separate entry point with the application's own
 * database and the application's own clock, which these tests move. Nothing in it reads the
 * machine's idea of now, so three years pass in a line.
 */
describe('The retention sweep', () => {
  let app: TestApp;
  let administrator: RecruitedMember;
  let editor: RecruitedMember;
  let clara: RecruitedMember;
  let positionId: string;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();

    // Paid up for longer than any of these tests run, so that the people doing the looking are
    // never themselves what the sweep finds.
    administrator = await givenAnAdministrator(app, { paidThrough: '2060-12-31' });
    editor = await givenAMember(app, administrator.agent, {
      name: 'An Editor',
      role: 'editor',
      paidThrough: '2060-12-31',
    });
    clara = await givenAMember(app, administrator.agent, {
      name: 'Clara Conti',
      paidThrough: '2026-12-31',
    });

    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    const tavola = await givenTavola(app.db, model.id, { number: '2' });
    const sheet = await editor.agent
      .post(`/api/tavole/${tavola.id}/positions`)
      .send({ number: '14' })
      .expect(201);
    positionId = sheet.body.positions[0].id;
  });

  function sweep(options: { dryRun?: boolean } = {}): Promise<RetentionReport> {
    return runRetentionSweep(
      {
        db: app.db,
        clock: app.clock,
        logger: app.logger,
        fileStore: createFileStore(app.filesPath),
        retention: app.config.retention,
        paymentProvider: new UnconfiguredPaymentProvider(),
      },
      options,
    );
  }

  /**
   * Moves the archive's clock to a day — and signs the two people doing the looking back in,
   * because a session does not last three years and is not what any of this is about.
   */
  async function on(day: string): Promise<void> {
    app.clock.setTo(new Date(`${day}T09:00:00.000Z`));
    administrator.agent = await app.memberAgent(administrator);
    editor.agent = await app.memberAgent(editor);
  }

  async function roster(): Promise<RosterEntry[]> {
    const response = await administrator.agent.get('/api/roster').expect(200);
    return response.body.members;
  }

  async function onTheRoster(member: RecruitedMember): Promise<boolean> {
    return (await roster()).some((entry) => entry.id === member.entry.id);
  }

  async function contributions(): Promise<Contribution[]> {
    const response = await editor.agent
      .get(`/api/positions/${positionId}/contributions`)
      .expect(200);
    return response.body.contributions;
  }

  async function publishedBy(member: RecruitedMember, text: string): Promise<string> {
    const sent = await member.agent
      .post(`/api/positions/${positionId}/contributions`)
      .send({ text })
      .expect(201);
    const id: string = sent.body.contribution.id;
    await editor.agent
      .put(`/api/contributions/${id}/decision`)
      .send({ decision: 'publish' })
      .expect(200);
    return id;
  }

  /**
   * **A lapsed Account is kept**, so somebody who comes back after a year or two away finds
   * what they wrote still under their name and signs in with the password they already had.
   */
  it('leaves a lapsed member alone, so one who returns finds their history intact', async () => {
    await publishedBy(clara, 'This is the dust shield.');

    await on('2028-06-01');
    const report = await sweep();

    expect(report.accounts).toEqual([]);
    expect((await roster()).find((entry) => entry.id === clara.entry.id)).toMatchObject({
      standing: 'lapsed',
    });

    await administrator.agent
      .post(`/api/roster/${clara.entry.id}/payments`)
      .send({
        amount: '45',
        currency: 'EUR',
        receivedOn: '2028-06-01',
        reference: null,
        paidThrough: '2029-12-31',
      })
      .expect(201);

    const back = await app.memberAgent({ email: clara.email, password: clara.password });
    const read = await back.get(`/api/positions/${positionId}/contributions`).expect(200);
    expect(read.body.contributions).toMatchObject([
      { text: 'This is the dust shield.', authorName: 'Clara Conti', mine: true },
    ]);
  });

  /**
   * Three years, counted from the last day the Membership covered. On the last day of the third
   * year she is still kept; the day after, she is not.
   */
  it('deletes an Account once it has been lapsed for longer than the retention period', async () => {
    const written = await publishedBy(clara, 'This is the dust shield.');

    await on('2029-12-31');
    expect((await sweep()).accounts).toEqual([]);
    expect(await onTheRoster(clara)).toBe(true);

    await on('2030-01-01');
    const report = await sweep();

    expect(report).toMatchObject({
      asOf: '2030-01-01',
      retention: { accountYears: 3 },
      accounts: [
        {
          id: clara.entry.id,
          name: 'Clara Conti',
          email: clara.email,
          paidThrough: '2026-12-31',
          keptUntil: '2029-12-31',
        },
      ],
    });
    expect(await onTheRoster(clara)).toBe(false);
    expect(await contributions()).toMatchObject([
      { id: written, text: 'This is the dust shield.', authorName: null, state: 'published' },
    ]);

    // And having done it, there is nothing left for the next one to do.
    expect((await sweep()).accounts).toEqual([]);
  });

  it('never touches anybody whose Membership is live, however long they have been a member', async () => {
    await on('2059-06-01');

    const report = await sweep();

    // Clara, who lapsed in 2026, and nobody else.
    expect(report.accounts.map((account) => account.id)).toEqual([clara.entry.id]);
    expect(await onTheRoster(administrator)).toBe(true);
    expect(await onTheRoster(editor)).toBe(true);
  });

  /**
   * What the latest term says is what counts: a payment recorded late moves the date the three
   * years are counted from, and nothing about how long ago the *first* term ran out matters.
   */
  it('counts from the furthest Paid-through, not from the first term to run out', async () => {
    await on('2028-06-01');
    await administrator.agent
      .post(`/api/roster/${clara.entry.id}/payments`)
      .send({
        amount: '45',
        currency: 'EUR',
        receivedOn: '2028-06-01',
        reference: null,
        paidThrough: '2028-12-31',
      })
      .expect(201);

    await on('2030-01-01');
    expect((await sweep()).accounts).toEqual([]);

    await on('2032-01-01');
    expect((await sweep()).accounts).toMatchObject([{ keptUntil: '2031-12-31' }]);
  });

  /**
   * **The sweep cannot lock the Club out of its own roster** (issue #18). An Administrator keeps
   * working while lapsed, because the roster is behind the role and not behind a Membership — so
   * the only Administrator can be past the period and still be the person running the Club.
   */
  describe('and the Administrators', () => {
    it('never deletes the last one, and says who it kept and why', async () => {
      await on('2064-01-01');

      // The Administrator is past the period too, and still the one reading the roster.
      const report = await sweep();

      expect(report.keptAdministrator).toMatchObject({
        id: administrator.entry.id,
        paidThrough: '2060-12-31',
        keptUntil: '2063-12-31',
      });
      expect(report.accounts.map((account) => account.id).sort()).toEqual(
        [editor.entry.id, clara.entry.id].sort(),
      );
      expect(await onTheRoster(administrator)).toBe(true);
      expect(await onTheRoster(editor)).toBe(false);

      // And the next sweep, finding them still past it, keeps them still.
      expect(await sweep()).toMatchObject({
        accounts: [],
        keptAdministrator: { id: administrator.entry.id },
      });
    });

    it('keeps the one whose Membership ran out most recently, and deletes the rest', async () => {
      const treasurer = await givenAMember(app, administrator.agent, {
        name: 'A Treasurer',
        role: 'administrator',
        paidThrough: '2061-12-31',
      });
      const secretary = await givenAMember(app, administrator.agent, {
        name: 'A Secretary',
        role: 'administrator',
        paidThrough: '2059-12-31',
      });

      await on('2066-01-01');
      const report = await sweep();

      expect(report.keptAdministrator).toMatchObject({ id: treasurer.entry.id });
      expect(report.accounts.map((account) => account.id)).toEqual(
        expect.arrayContaining([administrator.entry.id, secretary.entry.id]),
      );

      const kept = await app.memberAgent(treasurer);
      const left = await kept.get('/api/roster').expect(200);
      expect(left.body.members.map((entry: RosterEntry) => entry.id)).toEqual([treasurer.entry.id]);
    });

    it('sweeps an Administrator who is not the last one exactly as before', async () => {
      const treasurer = await givenAMember(app, administrator.agent, {
        name: 'A Treasurer',
        role: 'administrator',
        paidThrough: '2026-12-31',
      });

      await on('2030-01-01');
      const report = await sweep();

      expect(report.keptAdministrator).toBeNull();
      expect(report.accounts.map((account) => account.id).sort()).toEqual(
        [treasurer.entry.id, clara.entry.id].sort(),
      );
      expect(await onTheRoster(treasurer)).toBe(false);
    });

    it('is what the dry run says too, on the roster and in the sweep', async () => {
      await on('2064-01-01');

      const rehearsed = await sweep({ dryRun: true });
      const read = await administrator.agent.get('/api/roster/retention').expect(200);

      expect(read.body).toEqual(rehearsed);
      expect(rehearsed.keptAdministrator).toMatchObject({ id: administrator.entry.id });
      expect(rehearsed.accounts.map((account) => account.id)).not.toContain(administrator.entry.id);
      expect(await sweep()).toEqual(rehearsed);
    });
  });

  describe('as a dry run', () => {
    /**
     * **Before it deletes them.** The same reading the sweep does, answering with the same
     * report, and writing nothing — so an Administrator can see a wrong date on the list while
     * there is still a person behind it to ask.
     */
    it('reports which Accounts a sweep would delete, and deletes nothing', async () => {
      await on('2030-01-01');

      const rehearsed = await sweep({ dryRun: true });

      expect(rehearsed.accounts).toMatchObject([{ id: clara.entry.id, keptUntil: '2029-12-31' }]);
      expect(await onTheRoster(clara)).toBe(true);

      // What the rehearsal said is what the sweep then does.
      expect(await sweep()).toEqual(rehearsed);
      expect(await onTheRoster(clara)).toBe(false);
    });

    /**
     * A member who lapsed long ago and paid long before that is two things the sweep deletes,
     * and it does them a day apart so that each is rehearsed first: the person today, and the
     * payment record they leave behind — already past its statutory period — tomorrow.
     */
    it('agrees with the sweep about payment records too, by leaving new ones for the next one', async () => {
      await administrator.agent
        .post(`/api/roster/${clara.entry.id}/payments`)
        .send({
          amount: '45',
          currency: 'EUR',
          receivedOn: '2026-01-10',
          reference: null,
          paidThrough: '2027-12-31',
        })
        .expect(201);

      await on('2040-01-01');
      const rehearsed = await sweep({ dryRun: true });
      expect(rehearsed).toMatchObject({ accounts: [{ id: clara.entry.id }], paymentRecords: 0 });
      expect(await sweep()).toEqual(rehearsed);

      await on('2040-01-02');
      const next = await sweep({ dryRun: true });
      expect(next).toMatchObject({ accounts: [], paymentRecords: 1 });
      expect(await sweep()).toEqual(next);
      expect(await app.db.$count(memberships, eq(memberships.amount, 4500))).toBe(0);
    });

    it('is what an Administrator reads on the roster, and nobody else may', async () => {
      await on('2030-01-01');

      const read = await administrator.agent.get('/api/roster/retention').expect(200);

      expect(read.body).toEqual(await sweep({ dryRun: true }));
      expect(read.body.accounts).toMatchObject([{ name: 'Clara Conti' }]);
      expect(await onTheRoster(clara)).toBe(true);

      await editor.agent.get('/api/roster/retention').expect(403);
    });
  });

  describe('and the payment records of people already gone', () => {
    async function givenClaraPaidAndWasErased(): Promise<void> {
      await administrator.agent
        .post(`/api/roster/${clara.entry.id}/payments`)
        .send({
          amount: '45',
          currency: 'EUR',
          receivedOn: '2026-01-10',
          reference: 'Ricambi 2027 Clara Conti',
          paidThrough: '2027-12-31',
        })
        .expect(201);
      await administrator.agent.delete(`/api/roster/${clara.entry.id}`).expect(200);
    }

    /**
     * **Regardless of erasure.** She asked to be forgotten the week she paid, and the payment
     * is still there ten years later — through the whole of the tenth calendar year after the
     * one it arrived in.
     */
    it('are kept for the statutory accounting period', async () => {
      await givenClaraPaidAndWasErased();

      await on('2036-12-31');
      const report = await sweep();

      expect(report.paymentRecords).toBe(0);
      expect(await app.db.$count(memberships, eq(memberships.payerName, 'Clara Conti'))).toBe(1);
    });

    /**
     * And not for longer. Once the period has run out there is no obligation left to keep the
     * name for, so the last of her goes — reported by the dry run first, like everything else.
     */
    it('are deleted once that period has run out', async () => {
      await givenClaraPaidAndWasErased();

      await on('2037-01-01');
      expect((await sweep({ dryRun: true })).paymentRecords).toBe(1);
      expect(await app.db.$count(memberships, eq(memberships.payerName, 'Clara Conti'))).toBe(1);

      expect((await sweep()).paymentRecords).toBe(1);
      expect(await app.db.$count(memberships, eq(memberships.payerName, 'Clara Conti'))).toBe(0);
    });

    it('never include what a member still on the roster paid', async () => {
      await administrator.agent
        .post(`/api/roster/${administrator.entry.id}/payments`)
        .send({
          amount: '45',
          currency: 'EUR',
          receivedOn: '2026-01-10',
          reference: null,
          paidThrough: '2061-12-31',
        })
        .expect(201);

      await on('2059-01-01');
      const report = await sweep();

      expect(report.paymentRecords).toBe(0);
      expect(await app.db.$count(memberships, eq(memberships.amount, 4500))).toBe(1);
    });
  });
});

/**
 * **The period is the association's to set** — three years is a proposal it has yet to confirm.
 * So it is configuration, and the privacy statement reads the figure from the running system
 * rather than having it typed into a page somewhere it could come to disagree with the sweep.
 */
describe('The retention period', () => {
  const started: TestApp[] = [];

  afterAll(async () => {
    await Promise.all(started.map((app) => app.close()));
  });

  it('is three years for an Account and ten for a payment record unless the Club says otherwise', async () => {
    const app = await startTestApp();
    started.push(app);

    const read = await app.request().get('/api/privacy').expect(200);

    expect(read.body.retention).toEqual({ accountYears: 3, paymentRecordYears: 10 });
  });

  it('is whatever the environment says, in the sweep and in the privacy statement alike', async () => {
    const app = await startTestApp({
      env: { RETENTION_YEARS: '1', PAYMENT_RECORD_RETENTION_YEARS: '8' },
    });
    started.push(app);
    await app.reset();
    const administrator = await givenAnAdministrator(app, { paidThrough: '2060-12-31' });
    const clara = await givenAMember(app, administrator.agent, { paidThrough: '2026-12-31' });

    const read = await app.request().get('/api/privacy').expect(200);
    expect(read.body.retention).toEqual({ accountYears: 1, paymentRecordYears: 8 });

    app.clock.setTo(new Date('2028-01-01T09:00:00.000Z'));
    const signedIn = await app.memberAgent(administrator);
    const report = await signedIn.get('/api/roster/retention').expect(200);
    expect(report.body.accounts).toMatchObject([{ id: clara.entry.id, keptUntil: '2027-12-31' }]);
  });
});
