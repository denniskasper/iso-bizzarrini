import type { MembershipStanding, RosterEntry, SignedInAccount } from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { anEventId, deliver, FakePaymentProvider } from './support/payments.js';
import { givenAMember, givenAnAdministrator, type RecruitedMember } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * Grace while a renewal is being confirmed (issue #17).
 *
 * The provider collects a renewal on the anniversary and a SEPA debit takes days to confirm, so
 * a member whose subscription renews itself would otherwise be shown the renewal screen for
 * those days every year. **A live Subscription with auto-renewal on reads for fourteen days past
 * the Paid-through.** The Paid-through itself does not move: grace changes who may read, not what
 * was paid for.
 */
describe('Grace while a renewal is confirmed', () => {
  let app: TestApp;
  let provider: FakePaymentProvider;
  let administrator: TestAgent;
  /** Paid up to the end of January 2026, with a subscription that renews itself. */
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
    administrator = (await givenAnAdministrator(app, { paidThrough: '2030-12-31' })).agent;
    await administrator.patch('/api/club').send({ fee: '45,00', currency: 'EUR' }).expect(200);
    elena = await givenAMember(app, administrator, {
      name: 'Elena Moretti',
      paidThrough: '2026-01-31',
    });
    await deliver(app, {
      id: anEventId(),
      kind: 'subscription-started',
      accountId: elena.entry.id,
      subscriptionId: 'sub_elena',
      renewsOn: '2026-01-31',
    }).expect(200);
  });

  /** The given number of days after the Paid-through, in the morning. */
  function daysAfterPaidThrough(days: number): void {
    app.clock.setTo(new Date('2026-01-31T09:00:00.000Z'));
    app.clock.advanceByDays(days);
  }

  async function session(agent: TestAgent = elena.agent): Promise<SignedInAccount> {
    return (await agent.get('/api/session').expect(200)).body.account;
  }

  async function onTheRoster(id: string = elena.entry.id): Promise<RosterEntry> {
    const roster = await administrator.get('/api/roster').expect(200);
    return (roster.body.members as RosterEntry[]).find((member) => member.id === id)!;
  }

  async function standing(agent: TestAgent = elena.agent): Promise<MembershipStanding> {
    return (await agent.get('/api/subscription').expect(200)).body.membership;
  }

  it('reads on the fourteenth day after the Paid-through, and is lapsed on the fifteenth', async () => {
    daysAfterPaidThrough(14);
    await elena.agent.get('/api/models').expect(200);
    expect(await session()).toMatchObject({
      membershipIsLive: true,
      paidThrough: '2026-01-31',
      graceUntil: '2026-02-14',
    });

    daysAfterPaidThrough(15);
    const refused = await elena.agent.get('/api/models').expect(403);
    expect(refused.body.error.code).toBe('membership_lapsed');
    expect(await session()).toMatchObject({ membershipIsLive: false, graceUntil: null });
    expect(await onTheRoster()).toMatchObject({ standing: 'lapsed', graceUntil: null });
  });

  it('is not in grace while the Paid-through has not passed', async () => {
    expect(await session()).toMatchObject({ membershipIsLive: true, graceUntil: null });
    expect(await onTheRoster()).toMatchObject({ standing: 'active', graceUntil: null });
  });

  /** Not lapsed anywhere — and the Administrator can see it is grace rather than paid up. */
  it('agrees across the session, the roster and the Membership page', async () => {
    daysAfterPaidThrough(3);

    expect(await onTheRoster()).toMatchObject({
      standing: 'active',
      paidThrough: '2026-01-31',
      graceUntil: '2026-02-14',
    });
    expect(await standing()).toMatchObject({
      paidThrough: '2026-01-31',
      graceUntil: '2026-02-14',
      subscription: { renews: true },
    });
  });

  it('ends at once when auto-renewal is switched off', async () => {
    daysAfterPaidThrough(3);
    await elena.agent.get('/api/models').expect(200);

    await elena.agent.put('/api/subscription/auto-renewal').send({ renews: false }).expect(200);

    await elena.agent.get('/api/models').expect(403);
    expect(await session()).toMatchObject({ membershipIsLive: false, graceUntil: null });
    expect(await onTheRoster()).toMatchObject({ standing: 'lapsed' });
  });

  it('is not given to a subscription that has ended', async () => {
    await deliver(app, {
      id: anEventId(),
      kind: 'subscription-changed',
      subscriptionId: 'sub_elena',
      renews: false,
      ended: true,
      renewsOn: null,
      occurredAt: '2026-01-20T08:00:00.000Z',
    }).expect(200);

    daysAfterPaidThrough(1);
    await elena.agent.get('/api/models').expect(403);
  });

  it('is not given to somebody with no subscription at all', async () => {
    const clara = await givenAMember(app, administrator, { paidThrough: '2026-01-31' });

    daysAfterPaidThrough(1);
    await clara.agent.get('/api/models').expect(403);
    expect(await onTheRoster(clara.entry.id)).toMatchObject({
      standing: 'lapsed',
      graceUntil: null,
    });
  });

  /** A payment confirmed in grace extends the term from the Paid-through, as it always did. */
  it('lets a payment confirmed in grace extend the term from the Paid-through', async () => {
    daysAfterPaidThrough(5);

    await deliver(app, {
      id: anEventId(),
      kind: 'payment-confirmed',
      accountId: elena.entry.id,
      subscriptionId: 'sub_elena',
      paymentId: `pay_${anEventId()}`,
      amount: 4500,
      currency: 'EUR',
      paidOn: '2026-02-05',
    }).expect(200);

    expect(await standing()).toMatchObject({ paidThrough: '2027-01-31', graceUntil: null });
    expect(await session()).toMatchObject({ membershipIsLive: true, graceUntil: null });
  });

  /** Grace had run out, so she had lapsed, and the year runs from the day the money arrived. */
  it('lets a payment confirmed after grace run from the day it arrived', async () => {
    daysAfterPaidThrough(20);

    await deliver(app, {
      id: anEventId(),
      kind: 'payment-confirmed',
      accountId: elena.entry.id,
      subscriptionId: 'sub_elena',
      paymentId: `pay_${anEventId()}`,
      amount: 4500,
      currency: 'EUR',
      paidOn: '2026-02-20',
    }).expect(200);

    expect(await standing()).toMatchObject({ paidThrough: '2027-02-20', graceUntil: null });
  });
});

describe('Grace, configured', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp({
      paymentProvider: new FakePaymentProvider(),
      env: { RENEWAL_GRACE_DAYS: '3' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('lasts as many days as it is told to', async () => {
    await app.reset();
    const administrator = (await givenAnAdministrator(app, { paidThrough: '2030-12-31' })).agent;
    const elena = await givenAMember(app, administrator, { paidThrough: '2026-01-31' });
    await deliver(app, {
      id: anEventId(),
      kind: 'subscription-started',
      accountId: elena.entry.id,
      subscriptionId: 'sub_elena',
      renewsOn: '2026-01-31',
    }).expect(200);

    app.clock.setTo(new Date('2026-02-03T09:00:00.000Z'));
    await elena.agent.get('/api/models').expect(200);

    app.clock.setTo(new Date('2026-02-04T09:00:00.000Z'));
    await elena.agent.get('/api/models').expect(403);
  });
});
