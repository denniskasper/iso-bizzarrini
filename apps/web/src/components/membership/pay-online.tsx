import type { MembershipStanding } from '@ricambi/contracts';
import { Button } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import { refusalText } from '@/lib/api';
import { useStartSubscription } from '@/lib/membership';

/**
 * Paying the fee through the platform (ADR 0004) — **the offer, and everything a member is
 * agreeing to, before the button that agrees to it.**
 *
 * Three things have to be said above the button and not after it: what it costs now, that it
 * will be collected again every year, and that stopping is one press. A subscription somebody
 * discovers they have is the failure this screen exists to rule out, so none of it is behind a
 * link or in a footnote.
 *
 * The fourth is the one that surprises people: **paying does not open the archive at that
 * moment.** A direct debit takes the bank a few working days to confirm, and the Membership
 * moves when it is confirmed and not before. Said here, a member waits; unsaid, they write to
 * the Club office asking where their access is.
 *
 * The one teal button on whichever screen it is on.
 */
export function PayOnline({ membership }: { membership: MembershipStanding }) {
  const start = useStartSubscription();
  const price = `${membership.fee} ${membership.currency}`;
  /** A price inside a sentence is still a figure, and is set like every other one. */
  const figure = <span className="tabular">{price}</span>;

  return (
    <section aria-labelledby="pay-online-heading">
      <h2 id="pay-online-heading" className="label">
        Pay by direct debit or card
      </h2>
      <p className="tabular mt-4 font-mono text-3xl text-text">
        {membership.fee} <span className="text-2xl text-muted">{membership.currency}</span>
        <span className="ml-3 font-sans text-base text-muted">a year</span>
      </p>

      <ul className="mt-6 flex flex-col gap-3 text-base text-pretty text-text">
        <li>
          {figure} is collected now, and {figure} again each year, until you cancel.
        </li>
        <li>
          Cancelling is one press on your Membership page. You keep everything you have already paid
          for.
        </li>
        <li>
          Your Membership moves when the bank confirms the payment: at once for a card, a few
          working days for a direct debit.
        </li>
      </ul>

      {start.isError && (
        <div className="mt-6">
          <Refusal>{refusalText(start.error)}</Refusal>
        </div>
      )}

      {/* Stays "Taking you…" after it succeeds: the browser is already leaving for the
          provider's page, and a button that came back to life would invite a second press. */}
      <Button
        variant="primary"
        size="lg"
        className="mt-8"
        disabled={start.isPending || start.isSuccess}
        onClick={() => start.mutate()}
      >
        {start.isPending || start.isSuccess
          ? 'Taking you to the payment page…'
          : `Pay ${price} a year`}
      </Button>
      <p className="mt-4 text-sm text-pretty text-faint">
        You enter your bank or card details on the payment provider’s own page. Ricambi never sees
        them.
      </p>
    </section>
  );
}
