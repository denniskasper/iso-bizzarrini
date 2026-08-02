/**
 * The payment edge.
 *
 * The second external edge that is faked in tests. Deliberately narrow: the provider manages
 * subscriptions, retries, dunning, SCA and mandates (ADR 0004), so the only thing our code
 * needs from it is a trustworthy answer to "did this delivery really come from you, and what
 * does it say?". Paid-through advances on a confirmed payment and on nothing else.
 */
export interface WebhookDelivery {
  /** The raw request body, exactly as received — signatures are computed over bytes, not JSON. */
  rawBody: string;
  signature: string | undefined;
}

export interface PaymentEvent {
  /** The provider's own event id. Used to make redelivery idempotent. */
  id: string;
  type: string;
  occurredAt: Date;
  payload: unknown;
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

export interface PaymentProvider {
  readonly name: string;
  /**
   * Whether this provider is pointed at real money — a live mandate, a real member's bank
   * account. A non-production environment refuses to start with one that is (see
   * `composition/environment-safety.ts`), which is how "the keys here are test-mode" becomes a
   * property the system enforces rather than one an operator remembers.
   *
   * When Stripe arrives at ticket 18 this is read off the key itself: a live key says `true`,
   * a test key says `false`. Nothing else should be allowed to decide it.
   */
  readonly reachesRealMandates: boolean;
  /** Verifies the signature and decodes the delivery, or throws `WebhookVerificationError`. */
  readWebhookEvent(delivery: WebhookDelivery): PaymentEvent;
}

/**
 * Refuses everything. The default until Stripe is wired in, so an environment without payment
 * keys cannot accidentally accept an unverified webhook.
 */
export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly name = 'unconfigured';
  readonly reachesRealMandates = false;

  readWebhookEvent(): PaymentEvent {
    throw new WebhookVerificationError(
      'No payment provider is configured; refusing to accept a webhook delivery.',
    );
  }
}
