import type { MembershipStanding } from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PaymentEvent } from '../src/platform/payments.js';
import { anEventId, deliver, FakePaymentProvider } from './support/payments.js';
import { givenAMember, givenAnAdministrator, type RecruitedMember } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

type PaymentConfirmed = Extract<PaymentEvent, { kind: 'payment-confirmed' }>;

/**
 * Paying the fee through the platform (ADR 0004, issue #4).
 *
 * **The Paid-through moves when the money has arrived, and at no other moment.** That one rule
 * is what most of this file is about, because a SEPA debit is asked for days before it is
 * confirmed and can bounce in between: a member let in on the strength of having pressed a
 * button is a member who has to be thrown out again, and this archive does not do that.
 *
 * The provider is faked at the edge and nothing else is. Events are delivered the way the
 * provider delivers them — to an address nobody is signed in at, as bytes with a signature.
 */
describe('Paying through the platform', () => {
  let app: TestApp;
  let provider: FakePaymentProvider;
  let administrator: TestAgent;
  /** Paid up to the end of 2025, so lapsed by the time any of this happens. */
  let elena: RecruitedMember;

  beforeAll(async () => {
    provider = new FakePaymentProvider();
    app = await startTestApp({ paymentProvider: provider });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    provider.started.length = 0;
    provider.renewals.length = 0;
    provider.ended.length = 0;
    provider.down = false;

    administrator = (await givenAnAdministrator(app)).agent;
    await administrator.patch('/api/club').send({ fee: '45,00', currency: 'EUR' }).expect(200);
    elena = await givenAMember(app, administrator, {
      name: 'Elena Moretti',
      paidThrough: '2025-12-31',
    });
  });

  async function standing(agent: TestAgent = elena.agent): Promise<MembershipStanding> {
    const response = await agent.get('/api/subscription').expect(200);
    return response.body.membership;
  }

  /** The provider confirming that money arrived, for a subscription of Elena's unless said. */
  function paymentConfirmed(overrides: Partial<PaymentConfirmed> = {}): PaymentConfirmed {
    return {
      id: anEventId(),
      kind: 'payment-confirmed',
      accountId: elena.entry.id,
      subscriptionId: 'sub_elena',
      paymentId: `pay_${anEventId()}`,
      amount: 4500,
      currency: 'EUR',
      paidOn: '2026-01-20',
      ...overrides,
    };
  }

  describe('starting', () => {
    /**
     * She presses one button and is handed to the provider's page. What the provider is asked
     * for is the Club's fee as it stands on the Club's screen — and **her Membership has not
     * moved**, because nothing has been paid yet.
     */
    it('sends the member to the provider for the Club’s fee, and changes nothing yet', async () => {
      const started = await elena.agent.post('/api/subscription').expect(201);

      expect(started.body).toEqual({ paymentPageUrl: 'https://pay.example.invalid/checkout/1' });
      expect(provider.started).toMatchObject([
        { accountId: elena.entry.id, email: elena.email, amount: 4500, currency: 'EUR' },
      ]);
      expect(await standing()).toMatchObject({ paidThrough: '2025-12-31', subscription: null });
      await elena.agent.get('/api/models').expect(403);
    });
  });

  describe('a confirmed payment', () => {
    /**
     * A year on from the day the money arrived, since her term had already run out — and the
     * archive opens to her on the very next request, with nobody having repaired anything.
     */
    it('grants a year from the day it arrived, and lets a lapsed member straight back in', async () => {
      await deliver(app, paymentConfirmed({ paidOn: '2026-01-20' })).expect(200);

      expect(await standing()).toMatchObject({
        paidThrough: '2027-01-20',
        subscription: { renews: true },
        payments: [
          {
            paidOn: '2026-01-20',
            amount: '45.00',
            currency: 'EUR',
            paidThrough: '2027-01-20',
            hasReceipt: true,
          },
        ],
      });
      await elena.agent.get('/api/models').expect(200);
    });

    /**
     * Somebody who pays before their term is up loses none of it: the year is added to the end
     * of what they already hold, exactly as a transfer recorded early would be.
     */
    it('adds its year to the end of a term that is still running', async () => {
      const clara = await givenAMember(app, administrator, { paidThrough: '2026-12-31' });

      await deliver(
        app,
        paymentConfirmed({ accountId: clara.entry.id, subscriptionId: 'sub_clara' }),
      ).expect(200);

      expect(await standing(clara.agent)).toMatchObject({ paidThrough: '2027-12-31' });
    });

    /** Next year's collection, on the subscription the archive already knows about. */
    it('renews: the next one moves the date on again', async () => {
      await deliver(app, paymentConfirmed({ paidOn: '2026-01-20' })).expect(200);
      await deliver(app, paymentConfirmed({ paidOn: '2027-01-20' })).expect(200);

      const membership = await standing();
      expect(membership.paidThrough).toBe('2028-01-20');
      expect(membership.payments.map((payment) => payment.paidThrough)).toEqual([
        '2028-01-20',
        '2027-01-20',
      ]);
    });

    /**
     * The provider does not promise an order. Where the payment is the first the archive hears
     * of a subscription, it is enough: it says whose it is, and the term is granted.
     */
    it('is enough by itself, arriving before anything said a subscription had started', async () => {
      await deliver(app, paymentConfirmed()).expect(200);
      await deliver(app, {
        id: anEventId(),
        kind: 'subscription-started',
        accountId: elena.entry.id,
        subscriptionId: 'sub_elena',
        renewsOn: '2027-01-20',
      }).expect(200);

      expect(await standing()).toMatchObject({
        paidThrough: '2027-01-20',
        subscription: { renews: true },
      });
      expect((await standing()).payments).toHaveLength(1);
    });

    /**
     * Newer invoices do not always repeat whose they are. Where the subscription is already
     * known, that is enough to say.
     */
    it('finds whose it is from the subscription, where the payment itself does not say', async () => {
      await deliver(app, paymentConfirmed({ paidOn: '2026-01-20' })).expect(200);

      await deliver(app, paymentConfirmed({ accountId: null, paidOn: '2027-01-20' })).expect(200);

      expect((await standing()).paidThrough).toBe('2028-01-20');
    });

    /**
     * The Club's account with the provider can hold subscriptions this archive never started.
     * A payment under one is nobody's here: it is accepted, so the provider stops delivering
     * it, and it moves nobody's date.
     */
    it('that is nobody’s is accepted and grants nobody anything', async () => {
      await deliver(
        app,
        paymentConfirmed({ accountId: null, subscriptionId: 'sub_somebody_elses' }),
      ).expect(200);

      expect(await standing()).toMatchObject({ paidThrough: '2025-12-31', payments: [] });
    });
  });

  describe('a payment that has not been confirmed', () => {
    /**
     * **A failed debit changes nothing.** Her date stands where it was while the provider
     * retries — it was never moved forward on the strength of the attempt, so there is nothing
     * to take back.
     */
    it('changes nothing when it fails', async () => {
      await deliver(app, paymentConfirmed({ paidOn: '2026-01-20' })).expect(200);

      await deliver(app, {
        id: anEventId(),
        kind: 'payment-failed',
        subscriptionId: 'sub_elena',
      }).expect(200);

      expect(await standing()).toMatchObject({
        paidThrough: '2027-01-20',
        subscription: { renews: true },
      });
    });

    it('changes nothing when a subscription starts and no money has arrived', async () => {
      await deliver(app, {
        id: anEventId(),
        kind: 'subscription-started',
        accountId: elena.entry.id,
        subscriptionId: 'sub_elena',
        renewsOn: '2027-01-15',
      }).expect(200);

      expect(await standing()).toMatchObject({
        paidThrough: '2025-12-31',
        subscription: { renews: true, renewsOn: '2027-01-15' },
        payments: [],
      });
      await elena.agent.get('/api/models').expect(403);
    });
  });

  describe('a delivery', () => {
    /**
     * Providers redeliver: on a timeout, on a retry, when somebody presses "resend". One
     * payment is one year however many times the archive is told about it.
     */
    it('is acted on once, however many times it is delivered', async () => {
      const event = paymentConfirmed();

      await deliver(app, event).expect(200);
      await deliver(app, event).expect(200);
      await deliver(app, event).expect(200);

      const membership = await standing();
      expect(membership.paidThrough).toBe('2027-01-20');
      expect(membership.payments).toHaveLength(1);
    });

    /** And the same payment reported under a second event id is still one payment. */
    it('buys one term per payment, even when two events report the same payment', async () => {
      const event = paymentConfirmed({ paymentId: 'pay_the_same_one' });

      await deliver(app, event).expect(200);
      await deliver(app, { ...event, id: anEventId() }).expect(200);

      const membership = await standing();
      expect(membership.paidThrough).toBe('2027-01-20');
      expect(membership.payments).toHaveLength(1);
    });

    /**
     * **Nobody is signed in at this address**, so the signature is the whole of what stands
     * between the archive and anybody who would like a free year. Unsigned and wrongly signed
     * are refused alike, and have changed nothing.
     */
    it('is refused when it is unsigned or signed by somebody else', async () => {
      await deliver(app, paymentConfirmed(), { signature: null }).expect(400);
      await deliver(app, paymentConfirmed(), { signature: 'somebody-else' }).expect(400);

      expect(await standing()).toMatchObject({ paidThrough: '2025-12-31', payments: [] });
    });

    it('is accepted and ignored when it is about something the archive has no use for', async () => {
      await deliver(app, { id: anEventId(), kind: 'ignored', type: 'customer.updated' }).expect(
        200,
      );

      expect(await standing()).toMatchObject({ paidThrough: '2025-12-31', subscription: null });
    });

    /**
     * Money collected from somebody the archive no longer knows is money that will be collected
     * again next year unless something stops it. So the delivery is accepted and the
     * subscription behind it is ended at the provider.
     */
    it('for somebody who has since been erased ends the subscription it came from', async () => {
      await administrator.delete(`/api/roster/${elena.entry.id}`).expect(200);

      await deliver(app, paymentConfirmed()).expect(200);

      expect(provider.ended).toEqual(['sub_elena']);
    });
  });

  describe('cancelling', () => {
    beforeEach(async () => {
      await deliver(app, paymentConfirmed({ paidOn: '2026-01-20' })).expect(200);
    });

    /**
     * **One press, and nothing she paid for is taken away.** The provider is told not to
     * collect again; the date she is paid up to does not move, and the archive stays open to
     * her until it passes.
     */
    it('stops the renewal in one request and leaves access running to the date paid for', async () => {
      const cancelled = await elena.agent
        .put('/api/subscription/auto-renewal')
        .send({ renews: false })
        .expect(200);

      expect(provider.renewals).toEqual([{ subscriptionId: 'sub_elena', renews: false }]);
      expect(cancelled.body.membership).toMatchObject({
        paidThrough: '2027-01-20',
        subscription: { renews: false },
      });
      await elena.agent.get('/api/models').expect(200);
    });

    it('can be undone while the subscription is still running', async () => {
      await elena.agent.put('/api/subscription/auto-renewal').send({ renews: false }).expect(200);
      const resumed = await elena.agent
        .put('/api/subscription/auto-renewal')
        .send({ renews: true })
        .expect(200);

      expect(provider.renewals.at(-1)).toEqual({ subscriptionId: 'sub_elena', renews: true });
      expect(resumed.body.membership.subscription).toMatchObject({ renews: true });
    });

    /**
     * The provider is asked first. If it cannot be reached, the archive must not go on to say
     * "cancelled" over a subscription that will still collect.
     */
    it('says so, and records nothing, when the provider cannot be reached', async () => {
      provider.down = true;

      const refused = await elena.agent
        .put('/api/subscription/auto-renewal')
        .send({ renews: false })
        .expect(502);

      expect(refused.body.error.code).toBe('payment_provider_unavailable');
      expect((await standing()).subscription).toMatchObject({ renews: true });
    });

    /** Cancelling somewhere else — the provider's own e-mail, its dashboard — is heard too. */
    it('is also heard from the provider, and so is the subscription ending', async () => {
      await deliver(app, {
        id: anEventId(),
        kind: 'subscription-changed',
        subscriptionId: 'sub_elena',
        renews: false,
        ended: false,
        renewsOn: '2027-01-20',
        occurredAt: '2026-01-21T08:00:00.000Z',
      }).expect(200);
      expect((await standing()).subscription).toEqual({ renews: false, renewsOn: '2027-01-20' });

      await deliver(app, {
        id: anEventId(),
        kind: 'subscription-changed',
        subscriptionId: 'sub_elena',
        renews: false,
        ended: true,
        renewsOn: null,
        occurredAt: '2026-01-22T08:00:00.000Z',
      }).expect(200);

      // Over, and what it bought still stands. She can start another whenever she likes.
      expect(await standing()).toMatchObject({ paidThrough: '2027-01-20', subscription: null });
      await elena.agent.post('/api/subscription').expect(201);
    });

    /**
     * **Deliveries arrive in no promised order.** One the provider made before the member
     * cancelled, landing after, must not put "renews" back on a subscription that will not.
     */
    it('is not undone by an older delivery that arrives late', async () => {
      const cancelled = {
        id: anEventId(),
        kind: 'subscription-changed',
        subscriptionId: 'sub_elena',
        renews: false,
        ended: false,
        renewsOn: '2027-01-20',
        occurredAt: '2026-01-21T08:00:05.000Z',
      } as const;
      await deliver(app, cancelled).expect(200);

      await deliver(app, {
        ...cancelled,
        id: anEventId(),
        renews: true,
        occurredAt: '2026-01-21T08:00:00.000Z',
      }).expect(200);

      expect((await standing()).subscription).toMatchObject({ renews: false });
    });

    /**
     * Two tabs can start two subscriptions before the provider has mentioned either. A member
     * who cancels means all of it: the one they cannot see must not go on collecting.
     */
    it('reaches every subscription the member has, should there be more than one', async () => {
      await deliver(app, {
        id: anEventId(),
        kind: 'subscription-started',
        accountId: elena.entry.id,
        subscriptionId: 'sub_elena_again',
        renewsOn: null,
      }).expect(200);

      await elena.agent.put('/api/subscription/auto-renewal').send({ renews: false }).expect(200);

      expect(provider.renewals.map((each) => each.subscriptionId).sort()).toEqual([
        'sub_elena',
        'sub_elena_again',
      ]);
    });

    it('is only ever of one’s own', async () => {
      const other = await givenAMember(app, administrator);

      await other.agent.put('/api/subscription/auto-renewal').send({ renews: false }).expect(404);

      expect(provider.renewals).toEqual([]);
    });
  });

  describe('starting is refused', () => {
    it('to somebody who already has a subscription', async () => {
      await deliver(app, paymentConfirmed()).expect(200);

      const refused = await elena.agent.post('/api/subscription').expect(409);

      expect(refused.body.error.message).toMatch(/already have a subscription/);
      expect(provider.started).toEqual([]);
    });

    /** A Club that has not said what it charges cannot collect a subscription for it. */
    it('while the Club has not said what it charges', async () => {
      await administrator.patch('/api/club').send({ fee: '0' }).expect(200);

      expect(await standing()).toMatchObject({ canPayOnline: false });
      await elena.agent.post('/api/subscription').expect(409);
      expect(provider.started).toEqual([]);
    });

    it('to anybody who is not signed in', async () => {
      await app.request().post('/api/subscription').expect(401);
      await app.request().get('/api/subscription').expect(401);
    });

    it('plainly, when the provider cannot be reached', async () => {
      provider.down = true;

      const refused = await elena.agent.post('/api/subscription').expect(502);

      expect(refused.body.error.message).toMatch(/Nothing has been charged/);
    });
  });

  /**
   * **Some members will never sign a mandate**, and must not be locked out for it (ADR 0004).
   * A transfer recorded by an Administrator works exactly as it did, beside a subscription or
   * instead of one, and the member reads both in one list.
   */
  it('leaves recording a bank transfer by hand fully working', async () => {
    await deliver(app, paymentConfirmed({ paidOn: '2026-01-20' })).expect(200);

    await administrator
      .post(`/api/roster/${elena.entry.id}/payments`)
      .send({
        amount: '45',
        currency: 'EUR',
        receivedOn: '2026-01-10',
        reference: 'Ricambi 2028 Elena Moretti',
        paidThrough: '2028-01-20',
      })
      .expect(201);

    const membership = await standing();
    expect(membership.paidThrough).toBe('2028-01-20');
    expect(membership.payments).toMatchObject([
      { paidOn: '2026-01-20', hasReceipt: true },
      { paidOn: '2026-01-10', hasReceipt: false },
    ]);
  });

  describe('a receipt', () => {
    /**
     * The provider's own, and **asked for when the member wants it** — its links stop working
     * after a while, so the archive keeps which payment it was and never a link.
     */
    it('is the provider’s, fetched fresh for the member whose payment it was', async () => {
      await deliver(app, paymentConfirmed({ paymentId: 'pay_elena_2026' })).expect(200);
      const [payment] = (await standing()).payments;

      const sent = await elena.agent
        .get(`/api/subscription/payments/${payment?.id}/receipt`)
        .expect(303);

      expect(sent.headers['location']).toBe('https://pay.example.invalid/receipts/pay_elena_2026');
    });

    it('is nobody else’s to read, and a bank transfer has none', async () => {
      await deliver(app, paymentConfirmed()).expect(200);
      const [payment] = (await standing()).payments;
      const other = await givenAMember(app, administrator);

      await other.agent.get(`/api/subscription/payments/${payment?.id}/receipt`).expect(404);

      await administrator
        .post(`/api/roster/${other.entry.id}/payments`)
        .send({
          amount: '45',
          currency: 'EUR',
          receivedOn: '2026-01-10',
          reference: null,
          paidThrough: '2027-12-31',
        })
        .expect(201);
      const [transfer] = (await standing(other.agent)).payments;
      await other.agent.get(`/api/subscription/payments/${transfer?.id}/receipt`).expect(404);
    });
  });

  /**
   * Somebody who is erased must stop being charged. The subscription is ended at the provider
   * before the Account goes; what they paid stays on record (ADR 0007).
   */
  it('ends the subscription of a person who is erased, and keeps what they paid on record', async () => {
    await deliver(app, paymentConfirmed()).expect(200);

    const erased = await administrator.delete(`/api/roster/${elena.entry.id}`).expect(200);

    expect(provider.ended).toEqual(['sub_elena']);
    expect(erased.body.erased).toMatchObject({ paymentRecordsKept: 1 });
  });

  it('does not erase somebody whose subscription could not be ended', async () => {
    await deliver(app, paymentConfirmed()).expect(200);
    provider.down = true;

    await administrator.delete(`/api/roster/${elena.entry.id}`).expect(502);

    provider.down = false;
    expect((await standing()).paidThrough).toBe('2027-01-20');
  });
});

/**
 * An environment with no provider — a laptop, the preview — takes no payments and accepts no
 * deliveries. Members there are simply not offered a way to pay that does not exist.
 */
describe('Without a payment provider', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('offers nobody a way to pay online, and refuses every delivery', async () => {
    await app.reset();
    const administrator = await givenAnAdministrator(app);
    await administrator.agent.patch('/api/club').send({ fee: '45' }).expect(200);

    const read = await administrator.agent.get('/api/subscription').expect(200);
    expect(read.body.membership).toMatchObject({ canPayOnline: false, subscription: null });
    await administrator.agent.post('/api/subscription').expect(409);

    await app
      .request()
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .send('{"id":"evt_1","kind":"payment-confirmed"}')
      .expect(400);
  });
});
