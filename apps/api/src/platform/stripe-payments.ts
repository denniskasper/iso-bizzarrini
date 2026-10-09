import { createHmac, timingSafeEqual } from 'node:crypto';
import { today, type Clock } from './clock.js';
import {
  PaymentProviderError,
  WebhookVerificationError,
  type PaymentEvent,
  type PaymentProvider,
  type SubscriptionToStart,
  type WebhookDelivery,
} from './payments.js';

/**
 * Stripe, behind the payment edge (ADR 0004).
 *
 * **Everything Stripe-shaped is in this file and nowhere else**: its addresses, its form
 * encoding, its signature scheme and what its events look like. What leaves is the archive's own
 * `PaymentEvent`, so nothing downstream knows what an invoice object is.
 *
 * Written against Stripe's HTTP API directly rather than through its SDK. What is used is three
 * requests and one HMAC, and an edge this narrow is easier to read whole than a dependency is to
 * keep current — the SDK's own webhook check is the same twenty lines.
 *
 * What Stripe is asked to do is deliberately the least it can be: a hosted Checkout page in
 * subscription mode, so that card numbers, mandates, strong customer authentication, retries and
 * dunning are never this application's code.
 */
const API = 'https://api.stripe.com/v1';

/** How long a signed delivery stays good. Stripe's own recommendation, and its SDK's default. */
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

/** How long to wait for Stripe before telling the member it is not answering. */
const REQUEST_TIMEOUT_MS = 15_000;

/** A subscription in one of these is over, whatever else the object says. */
const ENDED = new Set(['canceled', 'incomplete_expired']);

export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  readonly takesPayments = true;
  readonly signatureHeader = 'stripe-signature';
  readonly reachesRealMandates: boolean;

  readonly #secretKey: string;
  readonly #webhookSecret: string;
  readonly #clock: Clock;
  readonly #fetch: typeof fetch;

  constructor(options: {
    secretKey: string;
    webhookSecret: string;
    /** For the age of a delivery's signature. Injected, like every other "now". */
    clock: Clock;
    /** The network, so a test can stand in for Stripe. */
    fetch?: typeof fetch;
  }) {
    this.#secretKey = options.secretKey;
    this.#webhookSecret = options.webhookSecret;
    this.#clock = options.clock;
    this.#fetch = options.fetch ?? fetch;

    /**
     * **Read off the key, and anything that is not provably a test key is real money.** The
     * cautious direction is the point: a key in a format nobody anticipated stops a practice
     * system from starting, which is an afternoon's annoyance, rather than letting one collect a
     * real member's dues.
     */
    this.reachesRealMandates = !/^(sk|rk)_test_/.test(options.secretKey);
  }

  async startSubscription(subscription: SubscriptionToStart): Promise<{ paymentPageUrl: string }> {
    const currency = subscription.currency.toLowerCase();

    const session = await this.#call('POST', '/checkout/sessions', {
      mode: 'subscription',
      customer_email: subscription.email,
      // Both, because either can be the first thing a later event carries: the session names
      // the Account once, and the subscription's metadata travels on every invoice after it.
      client_reference_id: subscription.accountId,
      'subscription_data[metadata][account_id]': subscription.accountId,
      // SEPA Direct Debit first, where the currency allows it at all; a card for everybody else.
      ...(currency === 'eur'
        ? { 'payment_method_types[0]': 'sepa_debit', 'payment_method_types[1]': 'card' }
        : { 'payment_method_types[0]': 'card' }),
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': currency,
      'line_items[0][price_data][unit_amount]': String(subscription.amount),
      'line_items[0][price_data][recurring][interval]': 'year',
      'line_items[0][price_data][product_data][name]': subscription.description,
      success_url: subscription.returnUrl,
      cancel_url: subscription.cancelUrl,
    });

    if (typeof session.url !== 'string') {
      throw new PaymentProviderError('Stripe answered without a page to send the member to.');
    }
    return { paymentPageUrl: session.url };
  }

  async setAutoRenewal(subscriptionId: string, renews: boolean): Promise<void> {
    await this.#call('POST', `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      cancel_at_period_end: String(!renews),
    });
  }

  async endSubscription(subscriptionId: string): Promise<void> {
    try {
      await this.#call('DELETE', `/subscriptions/${encodeURIComponent(subscriptionId)}`, {});
    } catch (error) {
      // Stripe no longer has it, so it is as ended as it can be.
      if (error instanceof PaymentProviderError && error.status === 404) {
        return;
      }
      throw error;
    }
  }

  async receiptUrlFor(paymentId: string): Promise<string | null> {
    const invoice = await this.#call('GET', `/invoices/${encodeURIComponent(paymentId)}`, {});
    const url = invoice['hosted_invoice_url'];
    return typeof url === 'string' ? url : null;
  }

  readWebhookEvent(delivery: WebhookDelivery): PaymentEvent {
    this.#verify(delivery);

    let event: StripeEvent;
    try {
      event = JSON.parse(delivery.rawBody) as StripeEvent;
    } catch {
      throw new WebhookVerificationError('That delivery is not something Stripe would send.');
    }
    if (typeof event.id !== 'string' || typeof event.type !== 'string') {
      throw new WebhookVerificationError('That delivery is not something Stripe would send.');
    }

    return read(event, today(this.#clock));
  }

  /**
   * Stripe's scheme: `t=<seconds>,v1=<hex>` where the hex is an HMAC-SHA256, keyed by the
   * endpoint's secret, over `<seconds>.<the exact bytes sent>`. There may be several `v1`s while
   * a secret is being rolled, and any one of them matching is enough.
   *
   * **The timestamp is part of what is signed, and it is checked against the clock** — which is
   * what makes a delivery somebody recorded off the wire worthless five minutes later.
   */
  #verify(delivery: WebhookDelivery): void {
    const parts = (delivery.signature ?? '').split(',').map((part) => part.trim().split('='));
    const timestamp = parts.find(([key]) => key === 't')?.[1];
    const candidates = parts.filter(([key]) => key === 'v1').map(([, value]) => value ?? '');

    if (timestamp === undefined || !/^\d+$/.test(timestamp) || candidates.length === 0) {
      throw new WebhookVerificationError('That delivery carries no signature Stripe would write.');
    }

    const expected = createHmac('sha256', this.#webhookSecret)
      .update(`${timestamp}.${delivery.rawBody}`)
      .digest();

    const genuine = candidates.some((candidate) => {
      const offered = Buffer.from(candidate, 'hex');
      return offered.length === expected.length && timingSafeEqual(offered, expected);
    });
    if (!genuine) {
      throw new WebhookVerificationError(
        'That delivery was not signed with this endpoint’s secret.',
      );
    }

    const age = Math.abs(this.#clock.now().getTime() / 1000 - Number(timestamp));
    if (age > SIGNATURE_TOLERANCE_SECONDS) {
      throw new WebhookVerificationError('That delivery was signed too long ago to be believed.');
    }
  }

  async #call(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    fields: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.#fetch(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.#secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        ...(method === 'POST' ? { body: new URLSearchParams(fields).toString() } : {}),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new PaymentProviderError('Stripe could not be reached.', { cause: error });
    }

    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || body === null) {
      // Stripe's own sentence about what was wrong, and nothing else of what it sent back.
      const said = (body?.['error'] as { message?: unknown } | undefined)?.message;
      throw new PaymentProviderError(
        `Stripe refused (${response.status})${typeof said === 'string' ? `: ${said}` : '.'}`,
        { status: response.status },
      );
    }
    return body;
  }
}

interface StripeEvent {
  id: string;
  type: string;
  /** Seconds. When Stripe made the event. */
  created?: number;
  data?: { object?: Record<string, unknown> };
}

/**
 * A Stripe event in the archive's words.
 *
 * **Two generations of invoice are read**, because which one arrives is decided by the API
 * version pinned on the webhook endpoint in Stripe's dashboard and not by this code: older ones
 * carry the subscription at `invoice.subscription`, newer ones at
 * `invoice.parent.subscription_details.subscription`. Reading both costs four lines and saves
 * a year of payments that confirm and grant nothing.
 */
function read(event: StripeEvent, today: string): PaymentEvent {
  const object = event.data?.object ?? {};
  const ignored: PaymentEvent = { id: event.id, kind: 'ignored', type: event.type };

  switch (event.type) {
    case 'checkout.session.completed': {
      const subscriptionId = idOf(object['subscription']);
      const accountId = accountIdFrom(object['client_reference_id']);
      if (subscriptionId === null || accountId === null) {
        return ignored;
      }
      return {
        id: event.id,
        kind: 'subscription-started',
        accountId,
        subscriptionId,
        renewsOn: null,
      };
    }

    case 'invoice.paid': {
      const details = subscriptionDetailsOf(object);
      const subscriptionId = idOf(object['subscription']) ?? idOf(details?.['subscription']);
      const amount = object['amount_paid'];
      const paymentId = object['id'];
      const currency = object['currency'];

      // An invoice that is not a subscription's is not a membership fee. And one for nothing —
      // Stripe raises them for trials and credits — is not money that arrived.
      if (
        subscriptionId === null ||
        typeof amount !== 'number' ||
        amount <= 0 ||
        typeof paymentId !== 'string' ||
        typeof currency !== 'string'
      ) {
        return ignored;
      }

      const paidAt = (object['status_transitions'] as Record<string, unknown> | undefined)?.[
        'paid_at'
      ];

      return {
        id: event.id,
        kind: 'payment-confirmed',
        accountId: accountIdIn(details?.['metadata']),
        subscriptionId,
        paymentId,
        amount,
        currency,
        // When Stripe says it was paid; failing that, when it said so; failing that, today.
        paidOn: dayOf(paidAt) ?? dayOf(event.created) ?? today,
      };
    }

    case 'invoice.payment_failed': {
      const subscriptionId =
        idOf(object['subscription']) ?? idOf(subscriptionDetailsOf(object)?.['subscription']);
      return subscriptionId === null
        ? ignored
        : { id: event.id, kind: 'payment-failed', subscriptionId };
    }

    case 'customer.subscription.created': {
      const subscriptionId = idOf(object);
      const accountId = accountIdIn(object['metadata']);
      if (subscriptionId === null || accountId === null) {
        return ignored;
      }
      return {
        id: event.id,
        kind: 'subscription-started',
        accountId,
        subscriptionId,
        renewsOn: dayOf(periodEndOf(object)),
      };
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscriptionId = idOf(object);
      if (subscriptionId === null) {
        return ignored;
      }
      const ended =
        event.type === 'customer.subscription.deleted' || ENDED.has(String(object['status']));
      const cancelling = object['cancel_at_period_end'] === true || object['cancel_at'] != null;
      return {
        id: event.id,
        kind: 'subscription-changed',
        subscriptionId,
        renews: !ended && !cancelling,
        ended,
        renewsOn: ended ? null : dayOf(periodEndOf(object)),
        occurredAt: new Date((event.created ?? 0) * 1000).toISOString(),
      };
    }

    default:
      return ignored;
  }
}

/** Stripe names another object by its id or, where it was asked to expand it, by the object. */
function idOf(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  const id = (value as { id?: unknown } | null | undefined)?.id;
  return typeof id === 'string' ? id : null;
}

/** Where an invoice says which subscription it is for, in either generation of the API. */
function subscriptionDetailsOf(
  invoice: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const parent = invoice['parent'] as Record<string, unknown> | undefined;
  return (parent?.['subscription_details'] ?? invoice['subscription_details']) as
    Record<string, unknown> | undefined;
}

function accountIdIn(metadata: unknown): string | null {
  return accountIdFrom((metadata as Record<string, unknown> | undefined)?.['account_id']);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An Account's id, or nothing. **Only ever something shaped like one**: the Club's Stripe
 * account may hold subscriptions this application never started, carrying whatever somebody
 * typed, and a value that is not an id must not travel on as if it were.
 */
function accountIdFrom(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

/** When a subscription next collects — on the subscription in older versions, on its item now. */
function periodEndOf(subscription: Record<string, unknown>): unknown {
  const items = subscription['items'] as { data?: Record<string, unknown>[] } | undefined;
  return subscription['current_period_end'] ?? items?.data?.[0]?.['current_period_end'];
}

/** Stripe's seconds as the archive's day, in UTC like every other day here. */
function dayOf(seconds: unknown): string | null {
  return typeof seconds === 'number' ? new Date(seconds * 1000).toISOString().slice(0, 10) : null;
}
