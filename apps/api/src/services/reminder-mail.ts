import type { ClubRecord, Renewal, TreasurerEntry } from '@ricambi/contracts';
import type { OutboundEmail } from '../platform/email.js';
import { asDay } from './member-mail.js';

/**
 * The two letters the reminder run sends (issue #3).
 *
 * **The opening sentence is the Club's and the rest is not.** What a reminder says about the
 * association and its membership is the treasurer's to word, on the Club's screen; the amount,
 * the account and the reference are facts read off the same record, laid out so they can be
 * carried to a banking app. Nothing here can be edited into a letter that omits where to pay.
 *
 * Signed by the platform, on the Club's behalf — that is who is writing, and a member should
 * be able to tell a machine's reminder from a person's letter.
 *
 * Plain text, like every other letter this system sends.
 */
export function reminderEmail(reminder: {
  to: string;
  name: string;
  paidThrough: string;
  club: ClubRecord;
  renewal: Renewal;
  /** Where the member can pay by direct debit or card instead, where that is on offer. */
  payOnlineAt: string | null;
}): OutboundEmail {
  const { renewal, club } = reminder;
  const runsTo = asDay(new Date(`${reminder.paidThrough}T00:00:00Z`));

  const transfer = [
    ['Amount', `${renewal.fee} ${renewal.currency}`],
    ['Account holder', renewal.bankAccountHolder],
    ['Bank', renewal.bankName],
    ['IBAN', renewal.iban],
    ['BIC', renewal.bic],
    ['Reference', renewal.reference],
    ['To arrive by', runsTo],
  ].filter((row): row is [string, string] => row[1] !== null);

  return {
    to: reminder.to,
    subject: `Your Club membership runs to ${runsTo}`,
    text: [
      `Hello ${reminder.name},`,
      '',
      club.reminderText,
      '',
      `Your membership is paid up to ${runsTo}. To renew it by bank transfer:`,
      '',
      ...transfer.map(([label, value]) => `  ${`${label}:`.padEnd(16)}${value}`),
      '',
      'Please write the reference exactly as it is above. It is how the treasurer finds your',
      'payment on the Club’s bank statement.',
      ...(reminder.payOnlineAt === null
        ? []
        : ['', 'Or pay by direct debit or card, and have it renew itself:', reminder.payOnlineAt]),
      '',
      renewal.officeEmail === null
        ? 'If you have already paid, or something here is wrong, contact the Club office.'
        : `If you have already paid, or something here is wrong, write to ${renewal.officeEmail}.`,
      '',
      'This reminder was sent by Ricambi, the Club’s parts reference, on the Club’s behalf.',
      'There is one per membership year, and this is it.',
    ].join('\n'),
  };
}

/**
 * What the treasurer is told: who is about to run out and who just has, each with the reference
 * to look for on the statement. A list to work down, so it is set as one.
 */
export function treasurerDigestEmail(digest: {
  to: string;
  runningOut: TreasurerEntry[];
  lapsed: TreasurerEntry[];
  windowDays: number;
  /** Where the same lists can be read, for the day this letter does not arrive. */
  readAt: string;
}): OutboundEmail {
  const line = (entry: TreasurerEntry): string =>
    `  ${entry.paidThrough}  ${entry.name} — ${
      entry.renewsItself ? 'renews by direct debit or card' : `expect "${entry.reference}"`
    }`;

  const section = (title: string, entries: TreasurerEntry[]): string[] =>
    entries.length === 0 ? [] : ['', title, ...entries.map(line)];

  return {
    to: digest.to,
    subject: `Club memberships: ${digest.runningOut.length} running out, ${digest.lapsed.length} lapsed`,
    text: [
      'Hello,',
      '',
      'Where the Club’s memberships stand, for matching incoming transfers.',
      ...section(`Running out in the next ${digest.windowDays} days`, digest.runningOut),
      ...section(`Lapsed in the last ${digest.windowDays} days`, digest.lapsed),
      '',
      'The same lists, always current:',
      digest.readAt,
      '',
      'Sent weekly by Ricambi, the Club’s parts reference, while there is somebody to list.',
    ].join('\n'),
  };
}
