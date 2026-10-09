/**
 * The payment edge.
 *
 * The second external edge that is faked in tests. Deliberately narrow: the provider manages
 * subscriptions, retries, dunning, SCA and mandates (ADR 0004), so what our code needs from it
 * is four things — somewhere to send a member to pay, a way to stop a subscription renewing, a
 * way to end one outright, and a trustworthy answer to "did this delivery really come from you,
 * and what does it say?". Paid-through advances on a confirmed payment and on nothing else.
 *
 * **Everything provider-shaped stops here.** What crosses this interface is in the archive's own
 * words — an Account, an amount in minor units, a day — so that no service knows what an invoice
 * object looks like, and a test can write an event by hand.
 */
export interface WebhookDelivery {
  /** The raw request body, exactly as received — signatures are computed over bytes, not JSON. */
  rawBody: string;
  signature: string | undefined;
}

/** What a member is sent to the provider to agree to. */
export interface SubscriptionToStart {
  /** Travels with the subscription, and is how every later event finds its way back to them. */
  accountId: string;
  email: string;
  /** In the currency's minor unit, per year. The Club's fee as it stands today. */
  amount: number;
  currency: string;
  /** What the member reads on the provider's page and on their bank statement. */
  description: string;
  /** Where the provider sends the member afterwards, having paid or having thought better of it. */
  returnUrl: string;
  cancelUrl: string;
}

interface Delivered {
  /** The provider's own event id. Used to make redelivery idempotent. */
  id: string;
}

/**
 * What a delivery says, in the archive's words. `renewsOn` is the day the provider will next
 * collect, as `YYYY-MM-DD`, where it knows.
 */
export type PaymentEvent = Delivered &
  (
    | {
        kind: 'subscription-started';
        accountId: string;
        subscriptionId: string;
        renewsOn: string | null;
      }
    | {
        /**
         * **Money that has actually arrived.** The only event that moves a Paid-through. A SEPA
         * debit is initiated days before it is confirmed and can still bounce in between, so
         * "the member pressed pay" is not this and never becomes it.
         */
        kind: 'payment-confirmed';
        /** Carried on the payment itself, because it can arrive before `subscription-started`. */
        accountId: string | null;
        subscriptionId: string;
        /** The provider's id for this one payment — the same across every event about it. */
        paymentId: string;
        /** In the currency's minor unit. */
        amount: number;
        currency: string;
        /** `YYYY-MM-DD`, the day the provider confirmed it. */
        paidOn: string;
      }
    | { kind: 'payment-failed'; subscriptionId: string }
    | {
        kind: 'subscription-changed';
        subscriptionId: string;
        /** Whether it will collect again. False once the member has cancelled. */
        renews: boolean;
        /** Over for good: cancelled and run out, or given up on by the provider. */
        ended: boolean;
        renewsOn: string | null;
        /**
         * When the provider made the event. Deliveries arrive in no promised order, and what a
         * subscription *is* must be the latest thing said about it rather than the last to land.
         */
        occurredAt: string;
      }
    /** Signed, genuine, and about something the archive has no use for. */
    | { kind: 'ignored'; type: string }
  );

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

/** The provider could not be reached, or refused. Never a member's fault. */
export class PaymentProviderError extends Error {
  /** The provider's HTTP status, where it answered at all. */
  readonly status: number | undefined;

  constructor(message: string, options?: { cause?: unknown; status?: number }) {
    super(message, options);
    this.name = 'PaymentProviderError';
    this.status = options?.status;
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
   * Read off the key itself: a live key says `true`, a test key says `false`. Nothing else is
   * allowed to decide it.
   */
  readonly reachesRealMandates: boolean;
  /** Whether a member can pay through it at all. False for an environment with no provider. */
  readonly takesPayments: boolean;
  /** Which request header carries the provider's signature over a delivery. Lower case. */
  readonly signatureHeader: string;
  /** Answers with the provider's own page, where the member agrees and pays. */
  startSubscription(subscription: SubscriptionToStart): Promise<{ paymentPageUrl: string }>;
  /**
   * Stops a subscription collecting again — or, with `true`, lets it. Either way what has been
   * paid for runs to its end.
   */
  setAutoRenewal(subscriptionId: string, renews: boolean): Promise<void>;
  /**
   * Ends a subscription now — for a person who is being erased, or whose Account is already
   * gone. One the provider no longer has is already ended, and is not a failure.
   */
  endSubscription(subscriptionId: string): Promise<void>;
  /**
   * Where the member can read the provider's own receipt for one payment, **asked for at the
   * moment they want it**: providers hand out links that stop working, so the archive keeps the
   * payment's id and never a link. Null where the provider has none.
   */
  receiptUrlFor(paymentId: string): Promise<string | null>;
  /** Verifies the signature and decodes the delivery, or throws `WebhookVerificationError`. */
  readWebhookEvent(delivery: WebhookDelivery): PaymentEvent;
}

/**
 * Refuses everything. The default wherever no provider is configured, so an environment without
 * payment keys cannot accidentally accept an unverified webhook — and members there are simply
 * not offered a way to pay that does not exist.
 */
export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly name = 'unconfigured';
  readonly reachesRealMandates = false;
  readonly takesPayments = false;
  readonly signatureHeader = 'provider-signature';

  async startSubscription(): Promise<{ paymentPageUrl: string }> {
    throw new PaymentProviderError('No payment provider is configured.');
  }

  async setAutoRenewal(): Promise<void> {
    throw new PaymentProviderError('No payment provider is configured.');
  }

  async endSubscription(): Promise<void> {
    throw new PaymentProviderError('No payment provider is configured.');
  }

  async receiptUrlFor(): Promise<string | null> {
    return null;
  }

  readWebhookEvent(): PaymentEvent {
    throw new WebhookVerificationError(
      'No payment provider is configured; refusing to accept a webhook delivery.',
    );
  }
}
