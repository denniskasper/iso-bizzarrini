import type { PrivacyResponse } from '@ricambi/contracts';
import { Link } from '@tanstack/react-router';
import { AsWritten, Mail, ReadingPage, Section, Unreadable } from '@/components/legal/reading';
import { PROCESSOR_WORK, usePrivacy } from '@/lib/legal';
import { years } from '@/lib/roster';

/**
 * What Ricambi does with what it knows about a person (issue #9, ADR 0007).
 *
 * **Every sentence here describes something the system does**, and every fact in it that could
 * change without the software changing is read from the running system rather than typed: the
 * retention figures are the ones the sweep is handed, and who the association is and who
 * handles data for it are what an Administrator has written on the Club's screen. A statement
 * that promised an erasure the association cannot perform would be worse than none — which is
 * why what is *kept* gets as much room as what is deleted.
 *
 * So a sentence here changes when the software does, in the same commit, and not otherwise. What
 * the association needs to add in its own words has a place of its own at the foot.
 *
 * Outside the gate. It is addressed to somebody deciding whether to hand over their address,
 * and to somebody who has left and wants to know what is still held; neither of them is signed
 * in.
 */
export function PrivacyPage() {
  const privacy = usePrivacy();

  if (privacy.isPending) {
    return null;
  }

  if (privacy.isError) {
    return (
      <Unreadable>
        The privacy statement could not be read just now. The Club office can tell you what it says.
      </Unreadable>
    );
  }

  return <Statement privacy={privacy.data} />;
}

function Statement({ privacy }: { privacy: PrivacyResponse }) {
  const { controller, dataProtectionContact, supervisoryAuthority, processors } = privacy;
  const { accountYears, paymentRecordYears } = privacy.retention;

  // Where a question about any of this goes: to whoever answers for data protection if the
  // association has named somebody, and to the Club office otherwise.
  const writeTo = dataProtectionContact.email ?? controller.email;

  return (
    <ReadingPage
      title="Privacy"
      lead="What Ricambi holds about you, who else handles it, how long it is kept, and what the Club cannot delete even when you ask."
    >
      <Section title="Who is responsible">
        {controller.name === null ? (
          <p data-testid="controller-unwritten">
            The Club is responsible for what Ricambi holds about you. It has not yet published its
            details here.
          </p>
        ) : (
          <>
            <p>
              The Club is responsible for what Ricambi holds about you — in the law’s word, it is
              the controller:
            </p>
            <address className="not-italic" data-testid="controller">
              <p className="font-semibold">{controller.name}</p>
              {controller.postalAddress !== null && (
                <p className="whitespace-pre-line">{controller.postalAddress}</p>
              )}
              {controller.email !== null && (
                <p>
                  <Mail address={controller.email} />
                </p>
              )}
            </address>
          </>
        )}
        {(dataProtectionContact.name !== null || dataProtectionContact.email !== null) && (
          <p data-testid="data-protection-contact">
            Questions about your data go to
            {dataProtectionContact.name !== null && <> {dataProtectionContact.name}</>}
            {dataProtectionContact.email !== null && (
              <>
                {dataProtectionContact.name !== null ? ', at' : ''}{' '}
                <Mail address={dataProtectionContact.email} />
              </>
            )}
            .
          </p>
        )}
        <p>
          The{' '}
          <Link to="/legal-notice" className="text-accent-ink underline underline-offset-4">
            legal notice
          </Link>{' '}
          says who represents the Club and where it is registered.
        </p>
      </Section>

      <Section title="What is held, and why">
        <p>
          <strong className="font-semibold">The roster.</strong> Your name, your e-mail address and
          the date your Membership is paid through, as the Club gave them. That is all Ricambi takes
          from the Club’s membership list: it is what deciding whether you may read the archive
          needs, and nothing else on the list is read or kept. The Club’s Administrators can see the
          roster; other members cannot. Where the Club has switched reminders on, Ricambi writes to
          that address about a month before your Membership runs out — one reminder for each
          membership year, and no more. The Club’s treasurer is sent a list of the members whose
          Membership is about to run out or just has.
        </p>
        <p>
          <strong className="font-semibold">Signing in.</strong> Your password, stored so that
          nobody — not an Administrator, not the people who run the system — can read it back.
          Ricambi sets one cookie, which keeps you signed in. Failed attempts to sign in are counted
          against the e-mail address that was tried, so that guessing can be stopped. When you
          choose a password it is checked against a public list of passwords known to have been
          stolen: the first five characters of a fingerprint of it are sent to the Pwned Passwords
          service, which is not enough to tell which password was asked about, and nothing about you
          is sent with it.
        </p>
        <p>
          <strong className="font-semibold">Contributions.</strong> Whatever you contribute: your
          words and the date. A published Contribution carries your name, because that is what lets
          another member judge it. Until an Editor has checked it, only you and the Editors can see
          it.
        </p>
        <p>
          <strong className="font-semibold">Photographs.</strong> The pictures you attach to a
          Contribution. Like the factory drawings they are never on a public address: they are
          served only to signed-in members.
        </p>
        <p>
          <strong className="font-semibold">Payments.</strong> The payments the Club has recorded
          from you: the amount, the day it arrived and the reference on the transfer. Ricambi does
          not hold your bank details. If you pay through Ricambi by direct debit or card, you give
          those details to the Club’s payment provider on its own page. Ricambi passes the provider
          your e-mail address so that it can write to you about the payment, and is told in return
          that the payment arrived; it keeps the amount, the date and the provider’s reference for
          the payment and for your subscription.
        </p>
        <p>
          <strong className="font-semibold">The server’s log.</strong> Each request to Ricambi is
          written to a log on the server with the address it came from, the page asked for and what
          your browser sent about itself. Your cookie and your password are never written to it.
          When something fails, the fault is written there too: which operation failed and which
          rule refused it, without the values it was working with. The log is used to keep the
          system running and to find faults.
        </p>
        <p>
          All of this is held to carry out your membership of the Club; the payment records are also
          kept because the law requires the Club to keep its accounts; and the sign-in counts and
          the log rest on the Club’s legitimate interest in keeping the archive secure (Article
          6(1)(b), (c) and (f) of the GDPR). Ricambi does not track you, and it shares nothing with
          advertisers or analytics services.
        </p>
      </Section>

      <Section title="Who else handles it">
        <p>
          The Club uses other companies to run Ricambi. They handle your data on the Club’s behalf
          and under its instructions, and may not use it for anything of their own.
        </p>
        <dl className="flex flex-col gap-4" data-testid="processors">
          {PROCESSOR_WORK.map((work) => {
            const processor = processors.find((named) => named.role === work.role);
            // Nobody named, and no true sentence to put there: say nothing rather than guess.
            if (!processor && work.unnamed === undefined) {
              return null;
            }

            return (
              <div key={work.role} data-testid={`processor-${work.role}`}>
                <dt className="label">{work.title}</dt>
                <dd className="mt-1">
                  {processor ? (
                    <>
                      <span className="font-semibold">{processor.name}</span>, {processor.location}.{' '}
                      {work.does}
                    </>
                  ) : (
                    work.unnamed
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </Section>

      <Section title="If your Membership runs out">
        <p>
          Nothing is deleted straight away. Your Account is kept for {years(accountYears)} after the
          last day your Membership covered — or after you were added, if you never had one — so that
          if you come back you sign in with the password you already had and find everything you
          wrote still under your name.
        </p>
        <p>
          After {years(accountYears)} it is deleted automatically. Nobody decides this case by case;
          the system applies the rule once a day. The one exception is the Club’s last
          Administrator, who is kept so that somebody can still open the roster, until another
          Administrator with a paid-up Membership takes over.
        </p>
      </Section>

      <Section title="If you ask to be deleted">
        <p>
          Write to the Club office. An Administrator deletes your Account, and with it your name,
          your e-mail address, your password, anything you wrote that had not been published, and
          your Membership history — except the payments, which are described below.
        </p>
      </Section>

      <Section title="What stays">
        <p>
          <strong className="font-semibold">What you published.</strong> The archive exists to keep
          what members know about these cars, so a published Contribution is not removed when its
          author is. It stays word for word, with its photographs, and where your name stood it says
          “a former member”.
        </p>
        <p>
          The text itself is not changed automatically. If something you wrote names you, or anybody
          else, in its own words, tell the Club office which one and an Editor will edit it.
        </p>
        <p>
          <strong className="font-semibold">Payments.</strong> The association is required by law to
          keep its accounting records. A payment the Club received from you is kept, with the
          amount, the date, the reference and the term it paid for, for as long as you have an
          Account. If your Account is deleted the payment is not: it is kept with your name until{' '}
          {years(paymentRecordYears)} after the end of the year it arrived in, and deleted after
          that.
        </p>
        <p>
          <strong className="font-semibold">Backups.</strong> Copies of the archive made before a
          deletion still contain what was deleted, until they are replaced by newer ones.
        </p>
      </Section>

      <Section title="What you can ask for">
        <p>
          You can ask the Club what it holds about you and for a copy of it, to have something wrong
          put right, to have your data deleted or its use restricted, and you can object to the uses
          that rest on the Club’s legitimate interest.
          {writeTo !== null && (
            <>
              {' '}
              Write to <Mail address={writeTo} />.
            </>
          )}
        </p>
        <p data-testid="supervisory-authority">
          If you think the Club has handled your data wrongly, you can complain to a data-protection
          authority
          {supervisoryAuthority !== null && (
            <>. The one responsible for the Club is {supervisoryAuthority}</>
          )}
          .
        </p>
      </Section>

      {privacy.further !== null && (
        <Section title="Further information">
          <AsWritten text={privacy.further} />
        </Section>
      )}
    </ReadingPage>
  );
}
