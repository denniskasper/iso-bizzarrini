import type { ReactNode } from 'react';
import { useRetentionTerms, years } from '@/lib/roster';

/**
 * What Ricambi keeps about a person, for how long, and what it cannot delete (ADR 0007).
 *
 * **Every sentence here describes something the system does**, and the two figures in it are
 * read from the running system rather than typed: the retention sweep and this page are handed
 * the same configuration, so the Club changing a period changes both. A statement that promised
 * an erasure the association cannot perform would be worse than none — which is why what is
 * *kept* gets as much room as what is deleted.
 *
 * Outside the gate. It is addressed to somebody deciding whether to hand over their address,
 * and to somebody who has left and wants to know what is still held; neither of them is signed
 * in.
 *
 * A reading page, so it is one column at the measure and nothing else: no cards, no icons, no
 * summary boxes. The headings are the questions a member actually asks.
 */
export function PrivacyPage() {
  const privacy = useRetentionTerms();

  if (privacy.isPending) {
    return null;
  }

  if (privacy.isError || !privacy.data) {
    return (
      <p className="text-lg text-pretty text-muted">
        The privacy statement could not be read just now. The Club office can tell you what it says.
      </p>
    );
  }

  const { accountYears, paymentRecordYears } = privacy.data;

  return (
    <article className="mx-auto max-w-measure animate-rise">
      <h1 className="display text-4xl tracking-display sm:text-5xl">Privacy</h1>
      <p className="mt-6 text-lg text-pretty text-muted">
        What Ricambi holds about you, how long it keeps it, and what the Club cannot delete even
        when you ask.
      </p>

      <Section title="What is held">
        <p>
          Your name and e-mail address, as the Club gave them. Your password, stored so that nobody
          — not an Administrator, not the people who run the system — can read it back. The dates
          your Membership has run to, and the payments the Club has recorded from you: the amount,
          the day it arrived and the reference on the transfer.
        </p>
        <p>
          Whatever you contribute: your words, the photographs you attach, and the date. A published
          Contribution carries your name, because that is what lets another member judge it.
        </p>
        <p>
          Ricambi sets one cookie, which keeps you signed in. It does not track you, and it shares
          nothing with advertisers or analytics services.
        </p>
      </Section>

      <Section title="If your Membership runs out">
        <p>
          Nothing is deleted straight away. Your Account is kept for {years(accountYears)} after the
          last day your Membership covered, so that if you come back you sign in with the password
          you already had and find everything you wrote still under your name.
        </p>
        <p>
          After {years(accountYears)} it is deleted automatically. Nobody decides this case by case;
          the system applies the rule once a day.
        </p>
      </Section>

      <Section title="If you ask to be deleted">
        <p>
          Write to the Club office. An Administrator deletes your Account, and with it your name,
          your e-mail address, your password, your Membership history and anything you wrote that
          had not been published.
        </p>
      </Section>

      <Section title="What stays">
        <p>
          <strong className="font-semibold">What you published.</strong> The archive exists to keep
          what members know about these cars, so a published Contribution is not removed when its
          author is. It stays word for word, and where your name stood it says “a former member”.
        </p>
        <p>
          The text itself is not changed automatically. If something you wrote names you, or anybody
          else, in its own words, tell the Club office which one and an Editor will edit it.
        </p>
        <p>
          <strong className="font-semibold">Payments.</strong> The association is required by law to
          keep its accounting records. A payment the Club received from you is kept, with the
          amount, the date and the reference, for as long as you have an Account. If your Account is
          deleted the payment is not: it is kept with your name until {years(paymentRecordYears)}{' '}
          after the end of the year it arrived in, and deleted after that.
        </p>
        <p>
          <strong className="font-semibold">Backups.</strong> Copies of the archive made before a
          deletion still contain what was deleted, until they are replaced by newer ones.
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="text-2xl font-semibold text-balance">{title}</h2>
      <div className="mt-5 flex flex-col gap-4 text-pretty text-text">{children}</div>
    </section>
  );
}
