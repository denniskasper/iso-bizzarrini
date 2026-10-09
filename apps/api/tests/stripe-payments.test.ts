import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/config.js';
import { MutableClock } from '../src/platform/clock.js';
import { PaymentProviderError, WebhookVerificationError } from '../src/platform/payments.js';
import { StripePaymentProvider } from '../src/platform/stripe-payments.js';

/**
 * Stripe, at the payment edge (ADR 0004).
 *
 * Everything the rest of the suite proves about payments it proves with a provider it wrote
 * itself. This is the other half: that **Stripe's own wire format** — its signature scheme, its
 * form-encoded requests, its event objects in both generations of its API — comes out the far
 * side of the adapter as what the archive expects.
 *
 * Nothing here reaches Stripe. The network is a function this file supplies, and the events are
 * written out by hand in the shape Stripe documents, signed the way Stripe signs them.
 */
const WEBHOOK_SECRET = 'whsec_a_secret_this_test_wrote';
const ACCOUNT_ID = '5f0c2f4e-6c1b-4f55-9d0e-1c6f5b2a7e10';

/** 2026-01-20T10:00:00Z, in Stripe's seconds. */
const PAID_AT = 1768903200;
/** 2027-01-20T10:00:00Z. */
const PERIOD_END = 1800439200;

function stripe(options: { secretKey?: string; fetch?: typeof fetch; now?: Date } = {}) {
  const clock = new MutableClock(options.now ?? new Date(PAID_AT * 1000));
  const provider = new StripePaymentProvider({
    secretKey: options.secretKey ?? 'sk_test_a_key_this_test_wrote',
    webhookSecret: WEBHOOK_SECRET,
    clock,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  return { provider, clock };
}

/** A delivery signed the way Stripe signs one: HMAC-SHA256 over `<seconds>.<body>`. */
function signed(event: unknown, options: { at?: number; secret?: string } = {}) {
  const rawBody = JSON.stringify(event);
  const at = options.at ?? PAID_AT;
  const v1 = createHmac('sha256', options.secret ?? WEBHOOK_SECRET)
    .update(`${at}.${rawBody}`)
    .digest('hex');
  return { rawBody, signature: `t=${at},v1=${v1}` };
}

function event(type: string, object: Record<string, unknown>) {
  return { id: 'evt_1', type, created: PAID_AT, data: { object } };
}

/** Stands in for the network, and remembers what it was asked. */
function network(answer: { status?: number; body: unknown }) {
  const asked: { url: string; method: string; headers: Record<string, string>; body: string }[] =
    [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    asked.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: init?.headers as Record<string, string>,
      body: typeof init?.body === 'string' ? init.body : '',
    });
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
  }) as typeof globalThis.fetch;
  return { fetch, asked };
}

describe('Stripe, at the payment edge', () => {
  describe('a delivery', () => {
    it('is believed when Stripe signed it', () => {
      const { provider } = stripe();

      const read = provider.readWebhookEvent(signed(event('customer.updated', { id: 'cus_1' })));

      expect(read).toEqual({ id: 'evt_1', kind: 'ignored', type: 'customer.updated' });
    });

    it('is refused when it is unsigned, signed with another secret, or altered on the way', () => {
      const { provider } = stripe();
      const genuine = signed(event('invoice.paid', { id: 'in_1' }));

      expect(() => provider.readWebhookEvent({ ...genuine, signature: undefined })).toThrow(
        WebhookVerificationError,
      );
      expect(() =>
        provider.readWebhookEvent(signed(event('invoice.paid', {}), { secret: 'whsec_other' })),
      ).toThrow(WebhookVerificationError);
      expect(() =>
        provider.readWebhookEvent({
          ...genuine,
          rawBody: genuine.rawBody.replace('in_1', 'in_2'),
        }),
      ).toThrow(WebhookVerificationError);
      expect(() => provider.readWebhookEvent({ ...genuine, signature: 'nonsense' })).toThrow(
        WebhookVerificationError,
      );
    });

    /**
     * **Replayed.** A genuine delivery somebody recorded off the wire is worthless once its
     * signature is more than five minutes old, by the archive's own clock.
     */
    it('is refused once its signature is more than five minutes old', () => {
      const { provider, clock } = stripe();
      const delivery = signed(event('customer.updated', {}));

      clock.advanceBy(5 * 60 * 1000);
      expect(provider.readWebhookEvent(delivery).kind).toBe('ignored');

      clock.advanceBy(1000);
      expect(() => provider.readWebhookEvent(delivery)).toThrow(/too long ago/);
    });

    it('is accepted under either signature while the endpoint’s secret is being rolled', () => {
      const { provider } = stripe();
      const genuine = signed(event('customer.updated', {}));
      const [timestamp, v1] = genuine.signature.split(',');

      const read = provider.readWebhookEvent({
        ...genuine,
        signature: `${timestamp},v1=${'0'.repeat(64)},${v1}`,
      });

      expect(read.kind).toBe('ignored');
    });
  });

  describe('what Stripe says', () => {
    function read(type: string, object: Record<string, unknown>) {
      return stripe().provider.readWebhookEvent(signed(event(type, object)));
    }

    it('a paid invoice is a confirmed payment, with whose it is and the receipt', () => {
      expect(
        read('invoice.paid', {
          id: 'in_1',
          subscription: 'sub_1',
          subscription_details: { metadata: { account_id: ACCOUNT_ID } },
          amount_paid: 4500,
          currency: 'eur',
          status_transitions: { paid_at: PAID_AT },
        }),
      ).toEqual({
        id: 'evt_1',
        kind: 'payment-confirmed',
        accountId: ACCOUNT_ID,
        subscriptionId: 'sub_1',
        paymentId: 'in_1',
        amount: 4500,
        currency: 'eur',
        paidOn: '2026-01-20',
      });
    });

    /** Newer API versions moved the subscription under `parent`. Both are a membership fee. */
    it('reads a paid invoice in the newer shape as well', () => {
      expect(
        read('invoice.paid', {
          id: 'in_2',
          parent: {
            subscription_details: {
              subscription: 'sub_1',
              metadata: { account_id: ACCOUNT_ID },
            },
          },
          amount_paid: 4500,
          currency: 'eur',
          status_transitions: { paid_at: PAID_AT },
        }),
      ).toMatchObject({
        kind: 'payment-confirmed',
        accountId: ACCOUNT_ID,
        subscriptionId: 'sub_1',
        paymentId: 'in_2',
      });
    });

    /**
     * Stripe raises invoices for nothing — for a trial, for a credit. They are marked paid and
     * they are not money, and a term must never be granted on one.
     */
    it('does not take an invoice for nothing, or one with no subscription, as a payment', () => {
      expect(
        read('invoice.paid', { id: 'in_3', subscription: 'sub_1', amount_paid: 0, currency: 'eur' })
          .kind,
      ).toBe('ignored');
      expect(read('invoice.paid', { id: 'in_4', amount_paid: 4500, currency: 'eur' }).kind).toBe(
        'ignored',
      );
    });

    it('a failed invoice is a failed payment and nothing more', () => {
      expect(read('invoice.payment_failed', { id: 'in_5', subscription: 'sub_1' })).toEqual({
        id: 'evt_1',
        kind: 'payment-failed',
        subscriptionId: 'sub_1',
      });
    });

    it('a completed checkout says whose the new subscription is', () => {
      expect(
        read('checkout.session.completed', {
          id: 'cs_1',
          mode: 'subscription',
          subscription: 'sub_1',
          client_reference_id: ACCOUNT_ID,
        }),
      ).toEqual({
        id: 'evt_1',
        kind: 'subscription-started',
        accountId: ACCOUNT_ID,
        subscriptionId: 'sub_1',
        renewsOn: null,
      });
    });

    it('a created subscription says so too, and when it next collects', () => {
      expect(
        read('customer.subscription.created', {
          id: 'sub_1',
          status: 'active',
          metadata: { account_id: ACCOUNT_ID },
          current_period_end: PERIOD_END,
        }),
      ).toMatchObject({
        kind: 'subscription-started',
        accountId: ACCOUNT_ID,
        renewsOn: '2027-01-20',
      });
    });

    it('a subscription set to cancel no longer renews, and is not yet over', () => {
      expect(
        read('customer.subscription.updated', {
          id: 'sub_1',
          status: 'active',
          cancel_at_period_end: true,
          items: { data: [{ current_period_end: PERIOD_END }] },
        }),
      ).toEqual({
        id: 'evt_1',
        kind: 'subscription-changed',
        subscriptionId: 'sub_1',
        renews: false,
        ended: false,
        renewsOn: '2027-01-20',
        occurredAt: '2026-01-20T10:00:00.000Z',
      });
    });

    it('a deleted subscription is over, and one Stripe is still chasing is not', () => {
      expect(
        read('customer.subscription.deleted', { id: 'sub_1', status: 'canceled' }),
      ).toMatchObject({ kind: 'subscription-changed', renews: false, ended: true, renewsOn: null });
      // Unpaid and past due still exist at Stripe, and can still be cancelled there.
      expect(
        read('customer.subscription.updated', { id: 'sub_1', status: 'unpaid' }),
      ).toMatchObject({ ended: false });
    });

    /**
     * The Club's Stripe account may hold subscriptions this archive never started. Whatever
     * they carry where an Account's id would be is not one, and must not travel on as one.
     */
    it('takes nothing for an Account’s id that is not shaped like one', () => {
      expect(
        read('checkout.session.completed', {
          mode: 'subscription',
          subscription: 'sub_9',
          client_reference_id: 'order-1234',
        }).kind,
      ).toBe('ignored');
      expect(
        read('invoice.paid', {
          id: 'in_9',
          subscription: 'sub_9',
          subscription_details: { metadata: { account_id: 'not-an-id' } },
          amount_paid: 4500,
          currency: 'eur',
        }),
      ).toMatchObject({ kind: 'payment-confirmed', accountId: null });
    });
  });

  describe('what Stripe is asked', () => {
    /**
     * A hosted page, in subscription mode, for a year at the Club's fee — SEPA Direct Debit
     * first, a card as the fallback. And the Account travels with it twice, because either the
     * session or the subscription can be the first thing a later event carries.
     */
    it('for a year’s subscription at the Club’s fee, by direct debit first', async () => {
      const { fetch, asked } = network({ body: { url: 'https://checkout.stripe.com/c/pay/cs_1' } });
      const { provider } = stripe({ fetch });

      const started = await provider.startSubscription({
        accountId: ACCOUNT_ID,
        email: 'elena@club.example',
        amount: 4500,
        currency: 'EUR',
        description: 'Club membership, one year',
        returnUrl: 'https://ricambi.example/membership?paid=1',
        cancelUrl: 'https://ricambi.example/membership',
      });

      expect(started).toEqual({ paymentPageUrl: 'https://checkout.stripe.com/c/pay/cs_1' });
      expect(asked).toHaveLength(1);
      expect(asked[0]).toMatchObject({
        url: 'https://api.stripe.com/v1/checkout/sessions',
        method: 'POST',
        headers: { Authorization: 'Bearer sk_test_a_key_this_test_wrote' },
      });
      expect(Object.fromEntries(new URLSearchParams(asked[0]?.body))).toEqual({
        mode: 'subscription',
        customer_email: 'elena@club.example',
        client_reference_id: ACCOUNT_ID,
        'subscription_data[metadata][account_id]': ACCOUNT_ID,
        'payment_method_types[0]': 'sepa_debit',
        'payment_method_types[1]': 'card',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][unit_amount]': '4500',
        'line_items[0][price_data][recurring][interval]': 'year',
        'line_items[0][price_data][product_data][name]': 'Club membership, one year',
        success_url: 'https://ricambi.example/membership?paid=1',
        cancel_url: 'https://ricambi.example/membership',
      });
    });

    it('for a card alone where the currency is not one SEPA debits', async () => {
      const { fetch, asked } = network({ body: { url: 'https://checkout.stripe.com/c/pay/cs_2' } });

      await stripe({ fetch }).provider.startSubscription({
        accountId: ACCOUNT_ID,
        email: 'elena@club.example',
        amount: 5000,
        currency: 'CHF',
        description: 'Club membership, one year',
        returnUrl: 'https://ricambi.example/membership?paid=1',
        cancelUrl: 'https://ricambi.example/membership',
      });

      const sent = Object.fromEntries(new URLSearchParams(asked[0]?.body));
      expect(sent['payment_method_types[0]']).toBe('card');
      expect(sent['payment_method_types[1]']).toBeUndefined();
    });

    it('to stop a subscription renewing at the end of what is paid for, or to let it', async () => {
      const { fetch, asked } = network({ body: { id: 'sub_1' } });
      const { provider } = stripe({ fetch });

      await provider.setAutoRenewal('sub_1', false);
      await provider.setAutoRenewal('sub_1', true);

      expect(asked.map((each) => [each.method, each.url, each.body])).toEqual([
        ['POST', 'https://api.stripe.com/v1/subscriptions/sub_1', 'cancel_at_period_end=true'],
        ['POST', 'https://api.stripe.com/v1/subscriptions/sub_1', 'cancel_at_period_end=false'],
      ]);
    });

    it('to end a subscription outright', async () => {
      const { fetch, asked } = network({ body: { id: 'sub_1', status: 'canceled' } });

      await stripe({ fetch }).provider.endSubscription('sub_1');

      expect(asked.map((each) => [each.method, each.url])).toEqual([
        ['DELETE', 'https://api.stripe.com/v1/subscriptions/sub_1'],
      ]);
    });

    it('treats a subscription Stripe no longer has as already ended', async () => {
      const { fetch } = network({
        status: 404,
        body: { error: { message: 'No such subscription' } },
      });

      await expect(stripe({ fetch }).provider.endSubscription('sub_gone')).resolves.toBeUndefined();
    });

    it('for a payment’s receipt at the moment a member wants it', async () => {
      const { fetch, asked } = network({
        body: { id: 'in_1', hosted_invoice_url: 'https://invoice.stripe.com/i/abc' },
      });

      const url = await stripe({ fetch }).provider.receiptUrlFor('in_1');

      expect(url).toBe('https://invoice.stripe.com/i/abc');
      expect(asked.map((each) => [each.method, each.url])).toEqual([
        ['GET', 'https://api.stripe.com/v1/invoices/in_1'],
      ]);
    });

    it('and says so plainly when Stripe refuses or cannot be reached', async () => {
      const refusing = network({ status: 402, body: { error: { message: 'No such price.' } } });
      await expect(
        stripe({ fetch: refusing.fetch }).provider.setAutoRenewal('sub_1', false),
      ).rejects.toThrow('Stripe refused (402): No such price.');

      const unreachable = (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch;
      await expect(
        stripe({ fetch: unreachable }).provider.endSubscription('sub_1'),
      ).rejects.toThrow(PaymentProviderError);
    });
  });

  /**
   * **Whether a key is real money is read off the key**, and a non-production environment
   * refuses to start with one that is. Anything not provably a test key counts as live.
   */
  describe('whether it reaches real mandates', () => {
    it('is no for a test key and yes for anything else', () => {
      expect(stripe({ secretKey: 'sk_test_abc' }).provider.reachesRealMandates).toBe(false);
      expect(stripe({ secretKey: 'rk_test_abc' }).provider.reachesRealMandates).toBe(false);
      expect(stripe({ secretKey: 'sk_live_abc' }).provider.reachesRealMandates).toBe(true);
      expect(stripe({ secretKey: 'rk_live_abc' }).provider.reachesRealMandates).toBe(true);
      expect(stripe({ secretKey: 'something-unexpected' }).provider.reachesRealMandates).toBe(true);
    });
  });

  describe('configuration', () => {
    const environment = { DATABASE_URL: 'postgres://unused/in-this-test' };

    it('takes no payments unless it is told who collects them', () => {
      expect(loadConfig(environment).payments).toEqual({ provider: 'none' });
    });

    it('refuses Stripe with half its keys, rather than offer a button it cannot honour', () => {
      expect(() =>
        loadConfig({
          ...environment,
          PAYMENT_PROVIDER: 'stripe',
          STRIPE_SECRET_KEY: 'sk_test_abc',
        }),
      ).toThrow(/needs both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET/);
    });

    it('reads both keys where both are given', () => {
      const config = loadConfig({
        ...environment,
        PAYMENT_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_test_abc',
        STRIPE_WEBHOOK_SECRET: 'whsec_abc',
      });

      expect(config.payments).toEqual({
        provider: 'stripe',
        stripe: { secretKey: 'sk_test_abc', webhookSecret: 'whsec_abc' },
      });
    });
  });
});
