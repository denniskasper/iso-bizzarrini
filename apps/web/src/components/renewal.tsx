import type { Renewal } from '@ricambi/contracts';
import { Link } from '@tanstack/react-router';
import { Mail } from 'lucide-react';
import { PayOnline } from '@/components/membership/pay-online';
import { Button } from '@/components/ui/button';
import { CopyValue } from '@/components/ui/copy-value';
import { Roundel } from '@/components/wordmark';
import { useMembership } from '@/lib/membership';
import { useRenewal, useSession } from '@/lib/session';

/**
 * **What a member sees instead of the archive when their Membership has run out.**
 *
 * They signed in successfully, which is the whole design: authenticate first, then authorise
 * (story 8). Because they have proved who they are, nothing on this screen discloses anything to
 * anybody, and it can therefore be *completely plain* — the date it ran out, the amount, where to
 * send it, the exact words to write on the transfer and who to ask. The alternative, and what
 * this replaces, is a refusal at the door and a telephone call to somebody's evening.
 *
 * **The reference is the thing this screen exists for.** The date and the fee a member could
 * guess at; the bank details they could be sent once and keep. What they cannot get anywhere else
 * is the string the treasurer will be reading down a bank statement looking for them, written out
 * in their own name — and a transfer that arrives without it is a payment nobody can match to a
 * person, which is the exact failure that makes somebody lapse twice.
 *
 * Nothing here is a form, because nothing here is something the archive can do. It is a set of
 * facts arranged so they can be carried to a banking app on the same phone: identifiers in the
 * mono face, tabular, each one press from the clipboard.
 */
export function RenewalScreen() {
  const { account, isAdministrator } = useSession();
  const renewal = useRenewal();
  const membership = useMembership();
  const paidThrough = account?.paidThrough ?? null;
  const subscription = membership.data?.membership.subscription;
  const payOnline =
    membership.data !== undefined &&
    membership.data.membership.canPayOnline &&
    membership.data.membership.subscription === null;

  return (
    <div className="mx-auto max-w-measure animate-rise">
      <Roundel className="size-7 text-muted" />
      <h1 className="mt-8 text-4xl font-semibold text-balance">
        {paidThrough === null
          ? 'The Club has no Membership recorded for you.'
          : 'Your Membership has run out.'}
      </h1>

      <p className="mt-6 text-lg text-pretty text-muted">
        {paidThrough === null ? (
          'You are signed in, so your account itself is fine — there is simply no paid-up term against it yet.'
        ) : (
          <>
            You are signed in, and everything is where you left it. The Club has you paid up to{' '}
            <span className="tabular">{paidThrough}</span>, and access comes back by itself the
            moment a payment is recorded — nobody has to repair anything.
          </>
        )}
      </p>

      {/*
        Nothing at all until the Club has answered. A skeleton of a bank account is worse than a
        pause: half an IBAN on screen is something somebody might act on.
      */}
      {/*
        **Paying through the platform comes first where it is on offer** (ADR 0004), and the
        transfer stays directly under it — some members will never sign a mandate, and this is
        the screen they are locked out behind. Somebody who has already started a subscription
        is told their payment is on its way rather than offered a second one.
      */}
      {subscription != null && (
        <div className="mt-10 border-l-2 border-line-strong pl-4">
          <p className="text-pretty text-text">
            {subscription.renews
              ? 'You have set up a payment. Your access comes back when the bank confirms it — a few working days for a direct debit.'
              : 'You have a subscription with auto-renewal turned off, so nothing more will be collected. Turn it back on from your Membership, or pay by bank transfer below.'}
          </p>
          <Button asChild variant="link" className="px-0">
            <Link to="/membership">Your Membership</Link>
          </Button>
        </div>
      )}
      {payOnline && (
        <div className="mt-14">
          <PayOnline membership={membership.data.membership} />
        </div>
      )}
      {payOnline && renewal.isSuccess && (
        <h2 className="mt-14 border-t border-line pt-10 text-2xl font-semibold">
          Or pay by bank transfer
        </h2>
      )}
      {renewal.isSuccess && <HowToPay renewal={renewal.data.renewal} />}
      {renewal.isError && (
        <p className="mt-10 text-lg text-pretty text-muted">
          The Club's details could not be read just now. Contact the Club office and they will sort
          it out.
        </p>
      )}

      {/* An Administrator can lapse too, and when they do they are one press from the screen
          that records their own payment. Nobody else is shown this. */}
      {isAdministrator && (
        <Button asChild variant="outline" size="lg" className="mt-12">
          <Link to="/roster">Go to the roster</Link>
        </Button>
      )}
    </div>
  );
}

/**
 * The transfer, in the order somebody fills a banking app in: how much, to whom, and what to
 * write on it. The reference comes last because it is the field people leave blank.
 */
export function HowToPay({ renewal }: { renewal: Renewal }) {
  const bank = [
    { label: 'Account holder', value: renewal.bankAccountHolder },
    { label: 'Bank', value: renewal.bankName },
  ].filter((row): row is { label: string; value: string } => row.value !== null);

  /**
   * **Whether there is anything here to act on at all.**
   *
   * An unconfigured Club has no bank, and its fee reads `0.00` because nobody has said what it
   * charges. Showing the amount anyway produces the worst screen on the site — "renewing costs
   * 0.00" immediately above "we have not said where to send it" — so the whole apparatus goes
   * together or not at all. What is left is one sentence, which is the only true thing there is
   * to say.
   */
  const canBePaid = renewal.iban !== null;

  if (!canBePaid) {
    return (
      <div className="mt-14 flex flex-col gap-10">
        <p className="text-lg text-pretty text-muted">
          The Club has not published what renewing costs or where to send it. Contact the Club
          office and they will tell you.
        </p>
        <WhoToAsk officeEmail={renewal.officeEmail} />
      </div>
    );
  }

  return (
    <div className="mt-14 flex flex-col gap-10">
      {/*
        Each step of the transfer is its own ruled section, the way the Club screen sets one out.
        Without the rule the section headings and the row labels are both small caps in the muted
        ink, and "Where to send it" reads as a sibling of "Account holder" rather than as the
        thing above it.
      */}
      <section>
        <h2 className="label">What renewing costs</h2>
        <p className="tabular mt-4 font-mono text-3xl text-text">
          {renewal.fee} <span className="text-2xl text-muted">{renewal.currency}</span>
        </p>
      </section>

      <section className="border-t border-line pt-10">
        <h2 className="label">Where to send it</h2>
        {/* The last row's rule and the next section's would otherwise be two lines a finger
            apart, which reads as a mistake rather than as a boundary. */}
        <dl className="mt-6 flex flex-col gap-4 [&>*:last-child]:border-b-0">
          {bank.map((row) => (
            <div key={row.label} className="border-b border-line pb-3">
              <dt className="label">{row.label}</dt>
              <dd className="mt-1 text-base text-pretty text-text">{row.value}</dd>
            </div>
          ))}
          {/* Words above, transcribed runs of characters below. */}
          <CopyValue label="IBAN" value={renewal.iban ?? ''} />
          {renewal.bic !== null && <CopyValue label="BIC" value={renewal.bic} />}
        </dl>
      </section>

      {/*
        **The one thing on this screen a member could not have worked out for themselves**, and so
        the one thing set larger than everything around it. A transfer that arrives without it is
        money the treasurer cannot match to a person.
      */}
      <section className="border-t border-line pt-10">
        <h2 className="label">What to write on it</h2>
        <div className="mt-6">
          <CopyValue label="Reference" value={renewal.reference} emphasis />
        </div>
        <p className="mt-4 text-sm text-pretty text-faint">
          This is how the treasurer finds your payment on the Club's bank statement. Nothing here
          checks what you type — a person reads it — so it is worth getting right.
        </p>
      </section>

      <WhoToAsk officeEmail={renewal.officeEmail} />
    </div>
  );
}

/**
 * **The way out of every case this screen did not think of** — a payment already made, an address
 * the Club has wrong, a Membership that should never have lapsed.
 *
 * A control at full height rather than an address underlined inside a sentence: this is a thing to
 * press, on a phone, in a garage, and the archive's own rule is that nothing interactive is under
 * 44px. The address is its label rather than hidden behind "Write to us", because somebody reading
 * this on the workshop computer may want to write it down and send the message from their own.
 *
 * A Club that has published no address gets the sentence without the control. There is nothing to
 * offer, and inventing somewhere to write would be worse than saying who to ask.
 */
function WhoToAsk({ officeEmail }: { officeEmail: string | null }) {
  return (
    <section className="border-t border-line pt-10">
      <p className="text-base text-pretty text-muted">
        Anything else — a payment already made, or a Membership that should not have run out — is
        the Club office's to sort out.
      </p>
      {officeEmail !== null && (
        <Button asChild variant="outline" className="mt-5 max-w-full">
          <a href={`mailto:${officeEmail}`}>
            <Mail />
            <span className="truncate">{officeEmail}</span>
          </a>
        </Button>
      )}
    </section>
  );
}
