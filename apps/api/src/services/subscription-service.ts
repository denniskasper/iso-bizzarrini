import type { Currency, MembershipStanding } from '@ricambi/contracts';
import type { SignedIn } from '../access/gate.js';
import type { Db } from '../db/client.js';
import { CURRENCIES } from '../db/schema.js';
import { ConflictError, NotFoundError, PaymentProviderUnavailableError } from '../http/errors.js';
import { yearsOn, type Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import {
  PaymentProviderError,
  type PaymentEvent,
  type PaymentProvider,
  type WebhookDelivery,
} from '../platform/payments.js';
import { createSubscriptionRepository } from '../repositories/subscription-repository.js';
import { accessOf, type AccountService } from './account-service.js';
import type { ClubService } from './club-service.js';
import { readAmount, writeAmount } from './money.js';

/**
 * Paying the fee through the platform, and having it renew itself (ADR 0004).
 *
 * **There is one rule here and everything else is arranged around it: the Paid-through moves
 * when the provider confirms the money has arrived, and at no other moment.** Not when a member
 * presses the button, not when they come back from the provider's page, not when a debit is
 * initiated. A SEPA debit can fail days after it was asked for, and an archive that let somebody
 * in on a promise would have to throw them out again; this one never has to.
 *
 * So the member-facing half of this file changes nothing that matters — it hands somebody to the
 * provider, or tells the provider to stop renewing — and the half that grants a term is reached
 * only by a signed delivery from the provider itself.
 *
 * **Handed the database itself rather than repositories**, like the roster import: an event is
 * acted on in one transaction, so that "this delivery has been seen" and "this term was granted"
 * cannot come apart, and the transaction decides the repository.
 */
export interface SubscriptionService {
  /** Where one member's Membership stands and whether it renews itself. */
  standingOf(who: SignedIn): Promise<MembershipStanding>;
  /** Hands the member to the provider's own page. Grants nothing. */
  start(who: SignedIn): Promise<{ paymentPageUrl: string }>;
  /** Cancels auto-renewal, or turns it back on. What has been paid for runs to its end. */
  setAutoRenewal(who: SignedIn, renews: boolean): Promise<MembershipStanding>;
  /** Where the provider's receipt for one of this member's own payments can be read. */
  receiptUrlFor(who: SignedIn, paymentId: string): Promise<string>;
  /**
   * A delivery from the provider. Verified first, and refused with `WebhookVerificationError`
   * where it is not what it says it is. Acting on one twice changes something once.
   */
  receive(delivery: WebhookDelivery): Promise<void>;
}

/**
 * Ends every subscription an Account still has with the provider, and throws where one could
 * not be ended. **Somebody who is erased must stop being charged** (ADR 0007) — and this is all
 * of the subscription machinery that erasing needs, so it is a function of its own rather than
 * a reason to build the whole service wherever a person can be deleted.
 */
export function createSubscriptionEnding(dependencies: {
  db: Db;
  clock: Clock;
  paymentProvider: PaymentProvider;
  logger: Logger;
}): (accountId: string) => Promise<void> {
  const { db, clock, paymentProvider, logger } = dependencies;
  const subscriptions = createSubscriptionRepository(db);

  return async (accountId) => {
    for (const live of await subscriptions.listLive(accountId)) {
      await reaching(logger, 'ending a subscription', () =>
        paymentProvider.endSubscription(live.providerSubscriptionId),
      );
      const now = clock.now();
      await subscriptions.update(
        live.providerSubscriptionId,
        { renews: false, renewsOn: null, endedAt: now },
        now,
      );
    }
  };
}

export function createSubscriptionService(dependencies: {
  db: Db;
  clock: Clock;
  paymentProvider: PaymentProvider;
  clubService: ClubService;
  /** Who somebody is now, for the answer to a change that may have ended their grace. */
  accounts: Pick<AccountService, 'describe'>;
  /** Days a renewing member reads past their Paid-through while the payment is confirmed. */
  renewalGraceDays: number;
  logger: Logger;
  /** Where a browser reaches this system, so the provider can send the member back to it. */
  publicUrl: string;
}): SubscriptionService {
  const { db, clock, paymentProvider, clubService, accounts, renewalGraceDays, logger, publicUrl } =
    dependencies;
  const subscriptions = createSubscriptionRepository(db);

  /**
   * What a year costs, in minor units, and whether paying online is on offer at all. A Club
   * that has not said what it charges is not one that can collect a subscription for it.
   */
  async function whatIsOffered(): Promise<{
    fee: number;
    currency: Currency;
    canPayOnline: boolean;
  }> {
    const club = await clubService.read();
    const fee = readAmount(club.fee) ?? 0;
    return {
      fee,
      currency: club.currency,
      canPayOnline: paymentProvider.takesPayments && fee > 0,
    };
  }

  async function standingOf(who: SignedIn): Promise<MembershipStanding> {
    const [{ fee, currency, canPayOnline }, [live], payments] = await Promise.all([
      whatIsOffered(),
      subscriptions.listLive(who.account.id),
      subscriptions.listPayments(who.account.id),
    ]);

    return {
      paidThrough: who.paidThrough,
      graceUntil: who.graceUntil,
      canPayOnline,
      fee: writeAmount(fee),
      currency,
      subscription: live === undefined ? null : { renews: live.renews, renewsOn: live.renewsOn },
      payments: payments.flatMap((payment) =>
        payment.amount === null || payment.currency === null
          ? []
          : [
              {
                id: payment.id,
                paidOn: payment.receivedOn ?? payment.recordedAt.toISOString().slice(0, 10),
                amount: writeAmount(payment.amount),
                currency: payment.currency,
                paidThrough: payment.paidThrough,
                hasReceipt: payment.providerPaymentId !== null,
              },
            ],
      ),
    };
  }

  /**
   * One event, in one transaction, **once**. The delivery is recorded first and everything it
   * does is written beside it, so a redelivery finds the row and stops, and a failure half way
   * leaves neither — the provider tries again and it is handled whole.
   *
   * Answers with a subscription to end at the provider afterwards, where the event turned out
   * to be about somebody who is no longer here.
   */
  function act(event: Exclude<PaymentEvent, { kind: 'ignored' }>): Promise<string | null> {
    return db.transaction(async (session) => {
      const held = createSubscriptionRepository(session);
      const now = clock.now();

      if (!(await held.recordEvent(event.id, event.kind, now))) {
        return null;
      }

      switch (event.kind) {
        case 'subscription-started': {
          if (!(await held.holdAccount(event.accountId))) {
            logger.warn(
              { eventId: event.id },
              'A subscription started for an Account that is gone',
            );
            return event.subscriptionId;
          }
          await held.ensure({
            accountId: event.accountId,
            providerSubscriptionId: event.subscriptionId,
            renewsOn: event.renewsOn,
            at: now,
          });
          return null;
        }

        case 'payment-confirmed': {
          // The payment says whose it is; where it does not, the subscription it belongs to
          // may already be known.
          const accountId =
            event.accountId ?? (await held.find(event.subscriptionId))?.accountId ?? null;

          if (accountId === null) {
            // **Accepted, and loudly.** Refusing it would only have the provider deliver the
            // same thing again for days: nothing about it will change. The Club's account can
            // hold subscriptions this application never started, and this is what one looks
            // like — or it is money somebody has to record by hand.
            logger.error(
              { eventId: event.id, paymentId: event.paymentId },
              'A confirmed payment does not say whose it is, and was not recorded',
            );
            return null;
          }

          const currency = CURRENCIES.find((known) => known === event.currency.toUpperCase());
          if (currency === undefined || event.amount <= 0) {
            logger.error(
              { eventId: event.id, paymentId: event.paymentId },
              'A confirmed payment was in a currency or amount the archive cannot record',
            );
            return null;
          }

          const account = await held.holdAccount(accountId);
          if (!account) {
            logger.error(
              { eventId: event.id, paymentId: event.paymentId },
              'A payment was confirmed for an Account that is gone; ending its subscription',
            );
            return event.subscriptionId;
          }

          /**
           * **A year on from wherever the Membership runs to — or from the day the money
           * arrived, where it had already run out.** The same answer the roster offers an
           * Administrator recording a transfer, so the two ways of paying buy the same thing.
           *
           * A member reading on grace that day has not run out (issue #17): the days they read
           * while the bank confirmed the payment were the start of the year it pays for, not
           * extra days on top of it.
           */
          const runsFrom =
            account.paidThrough !== null &&
            accessOf(account, event.paidOn, renewalGraceDays).membershipIsLive
              ? account.paidThrough
              : event.paidOn;

          await held.grantPaidTerm({
            accountId,
            paidThrough: yearsOn(runsFrom, 1),
            grantedBy: 'payment-provider',
            amount: event.amount,
            currency,
            receivedOn: event.paidOn,
            providerPaymentId: event.paymentId,
            recordedAt: now,
          });
          // The payment may be the first the archive hears of the subscription it belongs to.
          await held.ensure({
            accountId,
            providerSubscriptionId: event.subscriptionId,
            renewsOn: null,
            at: now,
          });
          return null;
        }

        case 'payment-failed':
          // **Nothing.** The Paid-through stands while the provider retries, and if it gives
          // up the Membership simply runs out on the day it always was going to.
          logger.info({ eventId: event.id }, 'A payment failed; the provider will retry');
          return null;

        case 'subscription-changed':
          await held.update(
            event.subscriptionId,
            {
              renews: event.renews,
              renewsOn: event.renewsOn,
              ...(event.ended ? { endedAt: now } : {}),
            },
            new Date(event.occurredAt),
          );
          return null;
      }
    });
  }

  return {
    standingOf,

    async start(who) {
      const { fee, currency, canPayOnline } = await whatIsOffered();
      if (!canPayOnline) {
        throw new ConflictError(
          'Paying through Ricambi is not available. The renewal screen says how to pay the ' +
            'Club by bank transfer.',
        );
      }

      const live = await subscriptions.listLive(who.account.id);
      if (live.length > 0) {
        throw new ConflictError(
          'You already have a subscription. If a payment is on its way, your Membership ' +
            'moves when the bank confirms it.',
        );
      }

      return reaching(logger, 'starting a subscription', () =>
        paymentProvider.startSubscription({
          accountId: who.account.id,
          email: who.account.email,
          amount: fee,
          currency,
          description: 'Club membership, one year',
          returnUrl: `${publicUrl}/membership?paid=1`,
          cancelUrl: `${publicUrl}/membership`,
        }),
      );
    },

    async setAutoRenewal(who, renews) {
      const live = await subscriptions.listLive(who.account.id);
      if (live.length === 0) {
        throw new NotFoundError('You have no subscription to change.');
      }

      // Every one of them, in the rare case there is more than one: a member who cancels
      // means all of it, and a second subscription they cannot see must not go on collecting.
      for (const subscription of live) {
        // The provider first, the row after: a row that says "cancelled" over a subscription
        // that will still collect is the one way this could cost somebody money.
        await reaching(logger, 'changing a renewal', () =>
          paymentProvider.setAutoRenewal(subscription.providerSubscriptionId, renews),
        );
        await subscriptions.update(subscription.providerSubscriptionId, { renews }, clock.now());
      }

      // Read again rather than answered from the request: turning auto-renewal off ends grace.
      return standingOf((await accounts.describe(who.account.id)) ?? who);
    },

    async receiptUrlFor(who, paymentId) {
      const payment = await subscriptions.findPayment(who.account.id, paymentId);
      const providerPaymentId = payment?.providerPaymentId ?? null;
      if (providerPaymentId === null) {
        throw new NotFoundError('There is no receipt for that payment.');
      }

      const url = await reaching(logger, 'reading a receipt', () =>
        paymentProvider.receiptUrlFor(providerPaymentId),
      );
      if (url === null) {
        throw new NotFoundError('The payment provider has no receipt for that payment.');
      }
      return url;
    },

    async receive(delivery) {
      const event = paymentProvider.readWebhookEvent(delivery);
      if (event.kind === 'ignored') {
        return;
      }

      const toEnd = await act(event);
      if (toEnd !== null) {
        // After the commit, and best effort: the delivery has been dealt with either way. A
        // subscription whose member is gone must stop collecting, and if the provider cannot
        // be reached now the next event about it comes back through here and tries again.
        await paymentProvider.endSubscription(toEnd).catch((error: unknown) => {
          logger.error({ err: error }, 'Could not end the subscription of an Account that is gone');
        });
      }
    },
  };
}

/** The provider's failures arrive at a person as one plain refusal, never as a stack. */
async function reaching<T>(logger: Logger, what: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      logger.error({ err: error }, `The payment provider failed while ${what}`);
      throw new PaymentProviderUnavailableError();
    }
    throw error;
  }
}
