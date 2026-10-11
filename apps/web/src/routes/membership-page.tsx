import type { MembershipPayment, MembershipStanding } from '@ricambi/contracts';
import { useSearch } from '@tanstack/react-router';
import { PayOnline } from '@/components/membership/pay-online';
import { HowToPay } from '@/components/renewal';
import { SignInLink } from '@/components/sign-in-link';
import { Button } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import { Roundel } from '@/components/wordmark';
import { refusalText } from '@/lib/api';
import { useMembership, useSetAutoRenewal } from '@/lib/membership';
import { useRenewal, useSession } from '@/lib/session';

/**
 * A member's own Membership: **the date it runs to, whether it will renew itself, and what
 * they have paid** (ADR 0004).
 *
 * The date is the hero, at the size the fee has on the renewal screen, because it is the answer
 * to the question somebody opened this page with. Under it is one sentence saying what happens
 * on that date — it renews, it runs out, or nothing is arranged — and one control that changes
 * the answer.
 *
 * **Cancelling is one press and has no "are you sure".** The rule is that stopping must be as
 * easy as starting, and a confirmation is a second press. What makes one press safe is that it
 * takes nothing away: access runs to the date already paid for, and the same control turns
 * renewal back on. The exception is grace (issue #17) — past the date, while the renewal is being
 * collected — and there the line under the control says what cancelling will end.
 *
 * Outside the archive's gate, like the renewal it sits beside: the member who most needs this
 * page is the one whose Membership has run out.
 */
export function MembershipPage() {
  const { signedIn, isPending } = useSession();
  const membership = useMembership({ enabled: signedIn });
  const { paid } = useSearch({ from: '/membership' });

  if (isPending) {
    return null;
  }

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-measure animate-rise">
        <Roundel className="size-7 text-muted" />
        <h1 className="mt-8 text-4xl font-semibold text-balance">Sign in first.</h1>
        <p className="mt-6 text-lg text-pretty text-muted">
          Your Membership is yours to see, and nobody else’s. Signing in is where that starts.
        </p>
        <Button asChild variant="primary" size="lg" className="mt-10">
          <SignInLink>Sign in</SignInLink>
        </Button>
      </div>
    );
  }

  if (membership.isPending) {
    return null;
  }

  if (membership.isError) {
    return (
      <p className="text-lg text-pretty text-muted">
        Your Membership could not be read just now. Nothing about it has changed.
      </p>
    );
  }

  return <Standing membership={membership.data.membership} justPaid={paid === '1'} />;
}

function Standing({ membership, justPaid }: { membership: MembershipStanding; justPaid: boolean }) {
  const { subscription, paidThrough } = membership;
  const offerToPay = subscription === null && membership.canPayOnline;

  return (
    <div className="mx-auto max-w-measure animate-rise">
      <h1 className="display text-4xl tracking-display sm:text-5xl">Membership</h1>

      {/*
        Back from the payment provider. Nothing has been confirmed yet — only the provider can
        say the money arrived — so this says what is true and not what the member hopes.
      */}
      {justPaid && (
        <p role="status" className="mt-8 border-l-2 border-line-strong pl-4 text-pretty text-text">
          Thank you. Your Membership moves when the bank confirms the payment — at once for a card,
          a few working days for a direct debit. There is nothing more to do.
        </p>
      )}

      <section className="mt-10">
        <h2 className="label">Paid through</h2>
        <p className="tabular mt-4 font-mono text-3xl text-text" data-testid="paid-through">
          {paidThrough ?? '—'}
        </p>
        <p className="mt-4 text-lg text-pretty text-muted">
          <WhatHappensThen membership={membership} />
        </p>
      </section>

      {subscription !== null && (
        <AutoRenewal renews={subscription.renews} inGrace={membership.graceUntil !== null} />
      )}

      {offerToPay && (
        <div className="mt-12 border-t border-line pt-10">
          <PayOnline membership={membership} />
        </div>
      )}

      {subscription === null && <BankTransfer alone={!offerToPay} />}

      <Payments payments={membership.payments} />
    </div>
  );
}

/**
 * What that date means, in a sentence — the thing the date alone does not say. A date inside
 * the sentence is still a number to be compared, so it is set like every other one.
 */
function WhatHappensThen({ membership }: { membership: MembershipStanding }) {
  const { paidThrough, graceUntil, subscription } = membership;

  // Past the date above and still reading (issue #17). The date has not moved because nothing
  // has been confirmed yet, and the sentence says so rather than letting it read as a lapse.
  if (graceUntil !== null) {
    return (
      <>
        Your renewal payment is being collected. Until the bank confirms it, your access holds to{' '}
        <span className="tabular">{graceUntil}</span>.
      </>
    );
  }
  if (subscription?.renews) {
    return subscription.renewsOn === null ? (
      <>It renews by itself: the fee is collected each year until you cancel.</>
    ) : (
      <>
        It renews by itself. The next fee is collected on{' '}
        <span className="tabular">{subscription.renewsOn}</span>.
      </>
    );
  }
  if (subscription !== null) {
    return paidThrough === null ? (
      <>Auto-renewal is off. Nothing more will be collected.</>
    ) : (
      <>
        Auto-renewal is off. Nothing more will be collected, and your access runs to{' '}
        <span className="tabular">{paidThrough}</span>.
      </>
    );
  }
  return paidThrough === null ? (
    <>The Club has no Membership recorded for you yet.</>
  ) : (
    <>It does not renew by itself. Your access runs to that date.</>
  );
}

/** The one control that changes what happens on the date above. One press, either way. */
function AutoRenewal({ renews, inGrace }: { renews: boolean; inGrace: boolean }) {
  const setAutoRenewal = useSetAutoRenewal();

  return (
    <div className="mt-8">
      {setAutoRenewal.isError && (
        <div className="mb-4">
          <Refusal>{refusalText(setAutoRenewal.error)}</Refusal>
        </div>
      )}
      <Button
        variant="outline"
        size="lg"
        disabled={setAutoRenewal.isPending}
        onClick={() => setAutoRenewal.mutate(!renews)}
      >
        {renews ? 'Cancel auto-renewal' : 'Turn auto-renewal back on'}
      </Button>
      {/* The one time cancelling takes something away: grace is for a renewal being collected,
          and a renewal that has been cancelled is not being collected. Said before the press. */}
      {renews && (
        <p className="mt-4 text-sm text-pretty text-faint">
          {inGrace
            ? 'Cancelling now stops the payment being collected, and your access ends with it.'
            : 'Cancelling stops the next collection. You keep everything you have already paid for.'}
        </p>
      )}
    </div>
  );
}

/**
 * **A bank transfer is always a way to pay** (ADR 0004): some members will never sign a
 * mandate, and the page that offers a subscription must not be the page that hides the
 * alternative. The same instructions the renewal screen gives, from the same place.
 */
function BankTransfer({ alone }: { alone: boolean }) {
  const renewal = useRenewal();

  if (!renewal.isSuccess) {
    return null;
  }

  return (
    <div className="mt-14 border-t border-line pt-10">
      <h2 className="text-2xl font-semibold text-balance">
        {alone ? 'Paying by bank transfer' : 'Or pay by bank transfer'}
      </h2>
      <HowToPay renewal={renewal.data.renewal} />
    </div>
  );
}

function Payments({ payments }: { payments: MembershipPayment[] }) {
  if (payments.length === 0) {
    return null;
  }

  return (
    <section className="mt-14 border-t border-line pt-10">
      <h2 className="text-2xl font-semibold">What you have paid</h2>
      <ul className="mt-6 border-b border-line" data-testid="payments">
        {payments.map((payment) => (
          <li key={payment.id} className="payment-row">
            <div>
              <p className="tabular text-sm text-text">{payment.paidOn}</p>
              <p className="tag mt-1">paid</p>
            </div>
            <div>
              <p className="tabular text-sm text-text">
                {payment.amount} {payment.currency}
              </p>
              <p className="tag mt-1">
                through <span className="tabular">{payment.paidThrough}</span>
              </p>
            </div>
            {payment.hasReceipt ? (
              <Button
                asChild
                variant="link"
                className="justify-self-start px-0 sm:justify-self-end"
              >
                {/* The archive's own address, which sends them on: the provider's links stop
                    working after a while, so a fresh one is asked for at the press. */}
                <a
                  href={`/api/subscription/payments/${payment.id}/receipt`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Receipt
                </a>
              </Button>
            ) : (
              <p className="tag">Bank transfer</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
