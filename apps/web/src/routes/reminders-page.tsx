import type {
  ReminderPlan,
  ReminderRecipient,
  ReminderSkipped,
  TreasurerEntry,
} from '@ricambi/contracts';
import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { AdministratorsOnly } from '@/components/roster/administrators-only';
import { Button } from '@/components/ui/button';
import { Field, Refusal } from '@/components/ui/field';
import { refusalText } from '@/lib/api';
import { useCorrectClub, useReminderPlan, useRunReminders } from '@/lib/roster';

/**
 * Renewal reminders (issue #3): **exactly who would be written to, before anything is switched
 * on.**
 *
 * The risk in reminders is the first day. A roster arrives with dates nobody has checked, and a
 * job that ran that night would ask the whole membership for money on the Club's behalf. So the
 * screen is arranged in the order an Administrator has to think in: who would get a letter
 * tonight, who is next, what the letter says — and only then the switch, which says in its own
 * label how many letters pressing it sends.
 *
 * Everything here is the preview. It is the same reading the nightly job does, so what is shown
 * is what happens; and it is shown whether reminders are on or off, in an environment that may
 * send them or one that never will.
 *
 * The treasurer's lists stand at the foot of the same page, so nobody depends on an e-mail
 * arriving to know who is about to run out.
 */
export function RemindersPage() {
  return (
    <AdministratorsOnly what="The reminders">
      <Reminders />
    </AdministratorsOnly>
  );
}

function Reminders() {
  const plan = useReminderPlan();

  if (plan.isPending) {
    return null;
  }

  if (plan.isError) {
    return (
      <p className="text-lg text-pretty text-muted">The reminders could not be read just now.</p>
    );
  }

  const { due, upcoming, skipped, letter, windowDays, digest } = plan.data;

  return (
    <div className="mx-auto max-w-measure animate-rise">
      <h1 className="display text-4xl tracking-display sm:text-5xl">Reminders</h1>
      <p className="mt-6 text-lg text-pretty text-muted">
        One e-mail, {windowDays} days before a Membership runs out, with everything needed to pay.
        One per membership year, and never a second.
      </p>

      <Sending plan={plan.data} />

      <Section
        title={
          due.length === 0
            ? 'Nobody would be written to tonight'
            : due.length === 1
              ? '1 member would be written to tonight'
              : `${due.length} members would be written to tonight`
        }
      >
        <Recipients recipients={due} dated="paidThrough" testId="reminders-due" />
      </Section>

      {upcoming.length > 0 && (
        <Section title={`In the next ${windowDays} days`}>
          <Recipients recipients={upcoming} dated="sendsOn" testId="reminders-upcoming" />
        </Section>
      )}

      {skipped.length > 0 && (
        <Section title="Not written to" note="Running out soon, and deliberately passed over.">
          <ul className="border-b border-line">
            {skipped.map((member) => (
              <li key={member.accountId} className="reminder-row">
                <div className="min-w-0">
                  <p className="font-medium text-text">{member.name}</p>
                  <p className="mt-1 text-sm text-pretty text-muted">{whyPassedOver(member)}</p>
                </div>
                <Dated date={member.paidThrough} label="paid through" />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {letter !== null && (
        <Section
          title="The letter"
          note="As the first of them would receive it. The opening sentence, the amount and the bank details are the Club’s, and change on the Club’s screen."
        >
          <div className="transcription">
            <p className="font-medium text-text">{letter.subject}</p>
            <p className="letter mt-4 text-text">{letter.text}</p>
          </div>
          <Button asChild variant="link" className="mt-2 px-0">
            <Link to="/club">Change the wording or the bank details</Link>
          </Button>
        </Section>
      )}

      <Treasurer digest={digest} windowDays={windowDays} />
    </div>
  );
}

/**
 * Whether reminders go out, and the one control that decides it.
 *
 * **Three things have to be true and the screen says which is not**, because a switch that is
 * on in an environment that never sends is the most misleading thing this page could show. The
 * switch's own label says how many letters it sends tonight: that number is the decision.
 */
function Sending({ plan }: { plan: ReminderPlan }) {
  const club = useCorrectClub();
  const run = useRunReminders();
  const { sending, due } = plan;
  const sends = sending.environmentAllows && sending.switchedOn && sending.canBePaid;

  const letters = due.length === 1 ? '1 reminder' : `${due.length} reminders`;

  return (
    <section
      className="mt-10 border-l-2 border-line-strong pl-4"
      aria-label="Whether reminders are sent"
    >
      <p className="text-lg font-medium text-pretty text-text" data-testid="reminders-state">
        {sends
          ? 'Reminders are on. They go out by themselves, once a night.'
          : sending.switchedOn
            ? 'Reminders are switched on, and nothing is being sent.'
            : 'Reminders are off. Nothing is sent.'}
      </p>

      {!sending.environmentAllows && (
        <p className="mt-3 text-pretty text-muted">
          This system cannot send reminders. Only the Club’s own archive can, once whoever runs it
          has allowed it and given it a way to deliver e-mail; what is below is what it would send.
        </p>
      )}
      {sending.environmentAllows && !sending.canBePaid && (
        <p className="mt-3 text-pretty text-muted">
          The Club has not said what renewing costs and where to send it, so a reminder would ask
          for money with no way to pay.
        </p>
      )}

      {(club.isError || run.isError) && (
        <div className="mt-4">
          <Refusal>{refusalText(club.error ?? run.error)}</Refusal>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {sending.switchedOn && (
          <Button
            variant="outline"
            size="lg"
            disabled={club.isPending}
            onClick={() => club.mutate({ remindersOn: false })}
          >
            Switch reminders off
          </Button>
        )}
        {/* Not offered where it could do nothing: a switch that turns on in a system that
            never sends is the most misleading control this page could have. */}
        {!sending.switchedOn && sending.environmentAllows && (
          <Button
            variant="primary"
            size="lg"
            disabled={club.isPending}
            onClick={() => club.mutate({ remindersOn: true })}
          >
            {sending.canBePaid && due.length > 0
              ? `Switch reminders on, and send ${letters} tonight`
              : 'Switch reminders on'}
          </Button>
        )}

        {sends && (
          <Button variant="outline" size="lg" disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? 'Sending…' : `Send ${letters} now`}
          </Button>
        )}
        {!sending.canBePaid && (
          <Button asChild variant="link">
            <Link to="/club">Fill in the Club’s details</Link>
          </Button>
        )}
      </div>

      {run.isSuccess && !run.isPending && (
        <p role="status" className="mt-4 text-sm text-pretty text-muted">
          {run.data.reminders === 1 ? '1 reminder' : `${run.data.reminders} reminders`} sent
          {run.data.digest ? ', and the treasurer’s digest.' : '.'}
        </p>
      )}
    </section>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="text-2xl font-semibold text-balance">{title}</h2>
      {note && <p className="mt-3 text-pretty text-muted">{note}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Recipients({
  recipients,
  dated,
  testId,
}: {
  recipients: ReminderRecipient[];
  /** Which date the list is about: when the term ends, or when the letter goes. */
  dated: 'paidThrough' | 'sendsOn';
  testId: string;
}) {
  if (recipients.length === 0) {
    return null;
  }

  return (
    <ul className="border-b border-line" data-testid={testId}>
      {recipients.map((recipient) => (
        <li key={recipient.accountId} className="reminder-row">
          <div className="min-w-0">
            <p className="font-medium text-text">{recipient.name}</p>
            <p className="tabular truncate text-sm text-muted">{recipient.email}</p>
            <p className="tabular mt-1 text-xs text-faint">{recipient.reference}</p>
          </div>
          {dated === 'paidThrough' ? (
            <Dated date={recipient.paidThrough} label="paid through" />
          ) : (
            <Dated date={recipient.sendsOn} label="written to on" />
          )}
        </li>
      ))}
    </ul>
  );
}

function Dated({ date, label }: { date: string; label: string }) {
  return (
    <div>
      <p className="tabular text-sm text-text">{date}</p>
      <p className="tag mt-1">{label}</p>
    </div>
  );
}

function whyPassedOver(member: ReminderSkipped): string {
  switch (member.why) {
    case 'short-term':
      return 'Their term was recorded less than the reminder window before it ends, so there was never a day to remind them on.';
    case 'renews-itself':
      return 'Their subscription collects the fee by itself. Asking them to send it too is how a member pays twice.';
  }
}

/**
 * What the treasurer is told, and where it is sent — the same two lists as the weekly digest,
 * read live, so matching transfers never waits on an e-mail.
 */
function Treasurer({ digest, windowDays }: { digest: ReminderPlan['digest']; windowDays: number }) {
  const club = useCorrectClub();
  const [address, setAddress] = useState(digest.treasurerEmail ?? '');
  const unchanged = address.trim() === (digest.treasurerEmail ?? '');

  return (
    <section className="mt-20 border-t border-line pt-10">
      <h2 className="text-2xl font-semibold">For the treasurer</h2>
      <p className="mt-3 text-pretty text-muted">
        Who is about to run out and who just has, with the reference to look for on the bank
        statement. Sent weekly while reminders are on and there is somebody to list
        {digest.lastSentOn === null ? (
          '.'
        ) : (
          <>
            ; last sent on <span className="tabular">{digest.lastSentOn}</span>.
          </>
        )}
      </p>

      <form
        className="mt-8 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          club.mutate({ treasurerEmail: address.trim() === '' ? null : address.trim() });
        }}
      >
        <Field
          label="Send the digest to"
          type="email"
          mono
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          hint="Leave it empty to send none. The lists below are here either way."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={club.isPending || unchanged}>
            {club.isPending ? 'Saving…' : 'Save the address'}
          </Button>
          {club.isSuccess && unchanged && <span className="text-sm text-faint">Saved.</span>}
        </div>
      </form>

      <Entries
        title={`Running out in the next ${windowDays} days`}
        entries={digest.runningOut}
        testId="treasurer-running-out"
      />
      <Entries
        title={`Lapsed in the last ${windowDays} days`}
        entries={digest.lapsed}
        testId="treasurer-lapsed"
      />

      {digest.letter !== null && (
        <div className="mt-10">
          <h3 className="label">The digest, as it would be sent today</h3>
          <div className="transcription mt-3">
            <p className="font-medium text-text">{digest.letter.subject}</p>
            <p className="letter mt-4 text-text">{digest.letter.text}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function Entries({
  title,
  entries,
  testId,
}: {
  title: string;
  entries: TreasurerEntry[];
  testId: string;
}) {
  return (
    <div className="mt-10">
      <h3 className="label">{title}</h3>
      {entries.length === 0 ? (
        <p className="mt-3 text-muted">Nobody.</p>
      ) : (
        <ul className="mt-3 border-b border-line" data-testid={testId}>
          {entries.map((entry) => (
            <li key={`${entry.name}-${entry.paidThrough}`} className="reminder-row">
              <div className="min-w-0">
                <p className="font-medium text-text">{entry.name}</p>
                {entry.renewsItself ? (
                  <p className="mt-1 text-xs text-faint">Renews by direct debit or card</p>
                ) : (
                  <p className="tabular mt-1 text-xs text-faint">{entry.reference}</p>
                )}
              </div>
              <Dated date={entry.paidThrough} label="paid through" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
