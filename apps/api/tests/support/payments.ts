import {
  PaymentProviderError,
  WebhookVerificationError,
  type PaymentEvent,
  type PaymentProvider,
  type SubscriptionToStart,
  type WebhookDelivery,
} from '../../src/platform/payments.js';
import type { TestApp } from './test-app.js';

/**
 * The payment edge, faked: **a provider this suite writes the events of.**
 *
 * Everything on our side of the edge is exercised for real — the route, the raw body, the
 * refusal of a delivery that is not signed, the idempotency, the term that is granted. What is
 * not here is the provider's own wire format, which is the adapter's business and is tested
 * where the adapter is. An event is written in the archive's words and signed with a secret
 * only this file knows.
 */
export const WEBHOOK_SIGNATURE = 'signed-by-the-provider-this-test-wrote';

export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'a payment provider this test wrote';
  readonly reachesRealMandates = false;
  readonly takesPayments = true;
  readonly signatureHeader = 'provider-signature';

  /** Every member sent off to pay, in order. */
  readonly started: SubscriptionToStart[] = [];
  /** Every subscription told to stop or resume renewing, in order. */
  readonly renewals: { subscriptionId: string; renews: boolean }[] = [];
  /** Every subscription ended outright. */
  readonly ended: string[] = [];
  /** Set to make the provider unreachable, which it sometimes is. */
  down = false;

  async startSubscription(subscription: SubscriptionToStart): Promise<{ paymentPageUrl: string }> {
    this.#reach();
    this.started.push(subscription);
    return { paymentPageUrl: `https://pay.example.invalid/checkout/${this.started.length}` };
  }

  async setAutoRenewal(subscriptionId: string, renews: boolean): Promise<void> {
    this.#reach();
    this.renewals.push({ subscriptionId, renews });
  }

  async endSubscription(subscriptionId: string): Promise<void> {
    this.#reach();
    this.ended.push(subscriptionId);
  }

  async receiptUrlFor(paymentId: string): Promise<string | null> {
    this.#reach();
    return `https://pay.example.invalid/receipts/${paymentId}`;
  }

  readWebhookEvent(delivery: WebhookDelivery): PaymentEvent {
    if (delivery.signature !== WEBHOOK_SIGNATURE) {
      throw new WebhookVerificationError('That delivery was not signed by this provider.');
    }
    return JSON.parse(delivery.rawBody) as PaymentEvent;
  }

  #reach(): void {
    if (this.down) {
      throw new PaymentProviderError('The provider is not answering.');
    }
  }
}

/** The provider delivering an event, as it does: unasked, unsigned-in, and signed. */
export function deliver(
  app: TestApp,
  event: PaymentEvent,
  options: { signature?: string | null } = {},
) {
  const request = app
    .request()
    .post('/api/payments/webhook')
    .set('Content-Type', 'application/json');

  const signature = options.signature === undefined ? WEBHOOK_SIGNATURE : options.signature;
  if (signature !== null) {
    void request.set('Provider-Signature', signature);
  }

  return request.send(JSON.stringify(event));
}

let counter = 1;

/** A provider's event id that no other event in this run has. */
export function anEventId(): string {
  return `evt_${counter++}`;
}
