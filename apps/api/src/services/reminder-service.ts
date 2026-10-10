import type {
  ClubRecord,
  ReminderPlan,
  ReminderRecipient,
  ReminderRun,
  ReminderSkipped,
  TreasurerEntry,
} from '@ricambi/contracts';
import { ConflictError } from '../http/errors.js';
import { daysOn, today, type Clock } from '../platform/clock.js';
import type { EmailSender, OutboundEmail } from '../platform/email.js';
import type { Logger } from '../platform/logger.js';
import type { ReminderRepository } from '../repositories/reminder-repository.js';
import { renewalOf, type ClubService } from './club-service.js';
import { readAmount } from './money.js';
import { reminderEmail, treasurerDigestEmail } from './reminder-mail.js';

/**
 * Renewal reminders and the treasurer's digest (issue #3).
 *
 * **The risk here is not the feature, it is the first day.** A roster arrives carrying dates
 * nobody has checked, some inside the reminder window, and a job that ran that night would
 * demand money from the whole membership on the Club's behalf — unrecallably. So three things
 * have to be true before one letter leaves: the environment allows it, an Administrator has
 * switched it on, and the Club has said where the money goes. And before any of them is true,
 * `plan` already says exactly who would be written to.
 *
 * **`plan` and `run` are one reading.** The run sends to whoever the plan calls due, so what an
 * Administrator was shown is what happens.
 */

/** How many days before a Paid-through the reminder goes out, and how far each list looks. */
export const REMINDER_WINDOW_DAYS = 30;

/** The least time between two digests. Weekly: often enough to match transfers, not a nag. */
const DIGEST_EVERY_DAYS = 7;

export interface ReminderService {
  /** The preview: who would be written to, and what the treasurer would be told. */
  plan(): Promise<ReminderPlan>;
  /** The nightly job. Sends what is due if sending is on, and nothing — silently — if not. */
  runNightly(): Promise<ReminderRun>;
  /**
   * An Administrator running it now. Sends what is due and the digest, or **refuses and says
   * which of the three conditions is not met** — a button that appeared to work and sent
   * nothing would be worse than one that says no.
   */
  runByHand(): Promise<ReminderRun>;
}

export function createReminderService(dependencies: {
  clock: Clock;
  reminderRepository: ReminderRepository;
  clubService: ClubService;
  emailSender: EmailSender;
  logger: Logger;
  /** `REMINDERS_ENABLED`: whether this environment has said it may send reminders. */
  remindersEnabled: boolean;
  /** Whether a member can pay through the platform here, so the letter may say so. */
  takesPayments: boolean;
  /** Where a browser reaches this system, for the two links the letters carry. */
  publicUrl: string;
}): ReminderService {
  const { clock, reminderRepository, clubService, emailSender, logger } = dependencies;
  const { takesPayments, publicUrl } = dependencies;

  /**
   * Allowed, **and able**. An environment whose mail is captured or refused delivers nothing,
   * and a run there would mark every term as reminded while the letters went nowhere — the one
   * way to use up a member's only reminder without their ever seeing it.
   */
  const environmentAllows = dependencies.remindersEnabled && emailSender.reachesRealPeople;

  /** Everything both `plan` and the run need, read once and against one day. */
  async function read() {
    const asOf = today(clock);
    const [club, terms, renewing, digestLastSentAt] = await Promise.all([
      clubService.read(),
      reminderRepository.furthestTerms(),
      reminderRepository.accountsThatRenewThemselves(),
      reminderRepository.digestLastSentAt(),
    ]);

    const due: Due[] = [];
    const upcoming: ReminderRecipient[] = [];
    const skipped: ReminderSkipped[] = [];
    const runningOut: TreasurerEntry[] = [];
    const lapsed: TreasurerEntry[] = [];

    const windowEnds = daysOn(asOf, REMINDER_WINDOW_DAYS);
    const windowBegan = daysOn(asOf, -REMINDER_WINDOW_DAYS);

    for (const term of terms) {
      const renewsItself = renewing.has(term.accountId);
      // **As the member was told it**: reckoned on a day the term was still running, so that
      // the reference the treasurer looks for after a lapse is the one in the reminder.
      const reference = renewalOf(
        club,
        term,
        term.paidThrough < asOf ? term.paidThrough : asOf,
      ).reference;
      const entry = { name: term.name, paidThrough: term.paidThrough, reference, renewsItself };

      if (term.paidThrough < asOf) {
        // Run out. Past reminding — "before their Membership expires" — and the treasurer's.
        if (term.paidThrough >= windowBegan) {
          lapsed.push(entry);
        }
        continue;
      }
      if (term.paidThrough <= windowEnds) {
        runningOut.push(entry);
      }

      const sendsOn = daysOn(term.paidThrough, -REMINDER_WINDOW_DAYS);
      if (term.reminderSentAt !== null || sendsOn > windowEnds) {
        continue;
      }

      const passedOver = (why: ReminderSkipped['why']): void => {
        skipped.push({
          accountId: term.accountId,
          name: term.name,
          paidThrough: term.paidThrough,
          why,
        });
      };

      // **A term shorter than the window never had a day on which its reminder was due.** A
      // Membership backfilled last week to end next week is not somebody to ask for money.
      if (term.startedOn > sendsOn) {
        passedOver('short-term');
        continue;
      }
      // The fee will be collected without their doing anything. Telling them to send it as
      // well is how a member pays twice.
      if (renewsItself) {
        passedOver('renews-itself');
        continue;
      }

      const recipient: ReminderRecipient = {
        accountId: term.accountId,
        name: term.name,
        email: term.email,
        paidThrough: term.paidThrough,
        sendsOn,
        reference,
      };
      if (sendsOn <= asOf) {
        due.push({ ...recipient, membershipId: term.membershipId });
      } else {
        upcoming.push(recipient);
      }
    }

    upcoming.sort((one, other) => one.sendsOn.localeCompare(other.sendsOn));
    runningOut.sort((one, other) => one.paidThrough.localeCompare(other.paidThrough));
    lapsed.sort((one, other) => other.paidThrough.localeCompare(one.paidThrough));

    const fee = readAmount(club.fee) ?? 0;
    return {
      asOf,
      club,
      due,
      upcoming,
      skipped,
      runningOut,
      lapsed,
      digestLastSentAt,
      sending: {
        environmentAllows,
        switchedOn: club.remindersOn,
        // The renewal screen's own test of whether there is anything to act on.
        canBePaid: club.iban !== null && fee > 0,
      },
      payOnlineAt: takesPayments && fee > 0 ? `${publicUrl}/membership` : null,
    };
  }

  function letterFor(
    club: ClubRecord,
    recipient: ReminderRecipient,
    asOf: string,
    payOnlineAt: string | null,
  ): OutboundEmail {
    return reminderEmail({
      to: recipient.email,
      name: recipient.name,
      paidThrough: recipient.paidThrough,
      club,
      renewal: renewalOf(club, recipient, asOf),
      payOnlineAt,
    });
  }

  type Reading = Awaited<ReturnType<typeof read>>;

  /** Which of the three is not met, in the words an Administrator is told it in. */
  function whyNot(sending: ReminderPlan['sending']): string | null {
    if (!sending.environmentAllows) {
      return (
        'Reminders cannot be sent from this environment. Only the Club’s own archive may ' +
        'send them, once whoever runs it has allowed it and given it a way to deliver e-mail.'
      );
    }
    if (!sending.switchedOn) {
      return 'Reminders are switched off. Switch them on once you have read who would be written to.';
    }
    if (!sending.canBePaid) {
      return (
        'The Club has not said what renewing costs and where to send it, so a reminder ' +
        'would ask for money with no way to pay. Fill in the Club’s details first.'
      );
    }
    return null;
  }

  async function send(options: { digestRegardless: boolean }): Promise<ReminderRun | string> {
    const reading = await read();
    const refusal = whyNot(reading.sending);
    if (refusal !== null) {
      return refusal;
    }

    let reminders = 0;
    for (const recipient of reading.due) {
      /**
       * **Marked first, then sent.** The mark is on the term and is taken only if nobody has
       * taken it, so a second run at the same moment, a re-run and a restore all find it set.
       * Where the sender then *refuses* the letter the mark is taken back off and tomorrow
       * tries again — a member who never got one is worse off than the rule is tidy. The one
       * way to two letters that leaves is a sender that failed after delivering.
       */
      if (!(await reminderRepository.claim(recipient.membershipId, clock.now()))) {
        continue;
      }
      try {
        await emailSender.send(
          letterFor(reading.club, recipient, reading.asOf, reading.payOnlineAt),
        );
        reminders += 1;
      } catch (error) {
        await reminderRepository.release(recipient.membershipId);
        logger.error({ err: error, accountId: recipient.accountId }, 'Could not send a reminder');
      }
    }

    const digest = await sendDigest(reading, options.digestRegardless);

    logger.info({ asOf: reading.asOf, reminders, digest }, 'Ran the renewal reminders');
    return { reminders, digest };
  }

  async function sendDigest(reading: Reading, regardless: boolean): Promise<boolean> {
    const to = reading.club.treasurerEmail;
    if (to === null || reading.runningOut.length + reading.lapsed.length === 0) {
      return false;
    }

    const last = reading.digestLastSentAt;
    const dueAgainOn =
      last === null ? null : daysOn(last.toISOString().slice(0, 10), DIGEST_EVERY_DAYS);
    if (!regardless && dueAgainOn !== null && reading.asOf < dueAgainOn) {
      return false;
    }

    // Taken before it is sent, like a reminder: two runs at once send one digest.
    if (!(await reminderRepository.claimDigest(last, clock.now()))) {
      return false;
    }
    try {
      await emailSender.send(digestLetter(reading, to));
    } catch (error) {
      await reminderRepository.releaseDigest(last);
      logger.error({ err: error }, 'Could not send the treasurer’s digest');
      return false;
    }
    return true;
  }

  function digestLetter(reading: Reading, to: string): OutboundEmail {
    return treasurerDigestEmail({
      to,
      runningOut: reading.runningOut,
      lapsed: reading.lapsed,
      windowDays: REMINDER_WINDOW_DAYS,
      readAt: `${publicUrl}/reminders`,
    });
  }

  return {
    async plan() {
      const reading = await read();
      const first = reading.due[0] ?? reading.upcoming[0];

      return {
        asOf: reading.asOf,
        windowDays: REMINDER_WINDOW_DAYS,
        sending: reading.sending,
        due: reading.due.map(({ membershipId: _membershipId, ...recipient }) => recipient),
        upcoming: reading.upcoming,
        skipped: reading.skipped,
        letter:
          first === undefined
            ? null
            : asLetter(letterFor(reading.club, first, reading.asOf, reading.payOnlineAt)),
        digest: {
          treasurerEmail: reading.club.treasurerEmail,
          runningOut: reading.runningOut,
          lapsed: reading.lapsed,
          lastSentOn: reading.digestLastSentAt?.toISOString().slice(0, 10) ?? null,
          letter:
            reading.runningOut.length + reading.lapsed.length === 0
              ? null
              : asLetter(digestLetter(reading, reading.club.treasurerEmail ?? '')),
        },
      };
    },

    async runNightly() {
      const sent = await send({ digestRegardless: false });
      return typeof sent === 'string' ? { reminders: 0, digest: false } : sent;
    },

    async runByHand() {
      const sent = await send({ digestRegardless: true });
      if (typeof sent === 'string') {
        throw new ConflictError(sent);
      }
      return sent;
    },
  };
}

/** Somebody due tonight, with the term the mark goes on. */
type Due = ReminderRecipient & { membershipId: string };

/** What a letter says, without who it is to — for showing rather than sending. */
function asLetter({ subject, text }: OutboundEmail): { subject: string; text: string } {
  return { subject, text };
}
