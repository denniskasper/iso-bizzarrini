import type { ClubRecord, CorrectClubRequest, Renewal } from '@ricambi/contracts';
import { violates } from '../db/constraints.js';
import type { ClubRow } from '../db/schema.js';
import { ValidationError } from '../http/errors.js';
import { today, type Clock } from '../platform/clock.js';
import type { ClubRepository } from '../repositories/club-repository.js';
import { readAmount, writeAmount } from './money.js';

/**
 * The Club: what membership costs, where the money goes, how a member should label their
 * transfer, and what a renewal reminder will say.
 *
 * All of it editable on a screen (story 130), because **a change of bank must not need a
 * developer**. The association's treasurer changes banks, raises the fee by five euros, or
 * rewrites a sentence that read badly, and none of those is a deployment.
 *
 * The row does not have to exist. An unwritten Club is a fee of nothing and no bank details yet,
 * which is exactly true of a system nobody has configured — and saying so here rather than in a
 * migration means changing the answer is changing this file.
 */
const UNWRITTEN: ClubRecord = {
  fee: '0.00',
  currency: 'EUR',
  bankAccountHolder: null,
  bankName: null,
  iban: null,
  bic: null,
  /**
   * What the treasurer wants to read on a bank statement. `{name}` and `{year}` are the Club's
   * own placeholders and nothing here parses what a member actually typed — matching a transfer
   * to a person is a human reading a statement, and pretending otherwise would be a machine
   * deciding somebody had not paid.
   */
  paymentReference: 'Ricambi {year} {name}',
  reminderText:
    'Your Club membership runs out shortly. Renewing keeps your access to the parts archive.',
  officeEmail: null,
};

export interface ClubService {
  read(): Promise<ClubRecord>;
  correct(fields: CorrectClubRequest): Promise<ClubRecord>;
  /**
   * What one member needs in order to pay: the Club's terms, with the payment reference already
   * written out in their name and for the year they are buying.
   *
   * Separate from `read` rather than a filter over it, because the two answer different
   * questions and are shown to different people. `read` is the association's record, an
   * Administrator's to keep; this is one member's instructions, and it must reach somebody whose
   * Membership has run out — which is exactly the person the archive is refusing.
   */
  renewalFor(member: { name: string; paidThrough: string | null }): Promise<Renewal>;
}

export function createClubService(dependencies: {
  clock: Clock;
  clubRepository: ClubRepository;
}): ClubService {
  const { clock, clubRepository } = dependencies;

  /**
   * The Club as it stands, which two of the three methods below need before they can do anything.
   *
   * A plain function rather than `this.read()`: `this` inside an object literal is whatever the
   * caller happened to invoke the method on, so a service destructured at a call site — which is
   * exactly what every controller in this application does with its dependencies — would throw
   * on a method that read fine in a test.
   */
  async function read(): Promise<ClubRecord> {
    const row = await clubRepository.read();
    return row === null ? UNWRITTEN : toClubRecord(row);
  }

  return {
    read,

    /**
     * A patch over whatever is there, so a screen that changes the IBAN does not have to send
     * the reminder text back to keep it. Where nothing is there yet, the unwritten Club is what
     * is patched — the first save is the same operation as the hundredth.
     */
    async correct(fields) {
      const current = await read();
      const merged: ClubRecord = { ...current, ...definedOnly(fields) };

      const fee = readAmount(merged.fee);
      if (fee === null) {
        throw new ValidationError(
          'A fee is an amount — 45, 45.00 or 45,50. Write 0 if the Club does not charge one.',
        );
      }

      try {
        return toClubRecord(
          await clubRepository.save({
            fee,
            currency: merged.currency,
            bankAccountHolder: blankToNull(merged.bankAccountHolder),
            bankName: blankToNull(merged.bankName),
            iban: blankToNull(merged.iban),
            bic: blankToNull(merged.bic),
            paymentReference: merged.paymentReference,
            reminderText: merged.reminderText,
            officeEmail: blankToNull(merged.officeEmail),
            updatedAt: clock.now(),
          }),
        );
      } catch (error) {
        if (violates(error, 'club_currency_is_tradeable')) {
          throw new ValidationError('That is not a currency these cars trade in.');
        }
        throw error;
      }
    },

    async renewalFor(member) {
      const club = await read();

      return {
        fee: club.fee,
        currency: club.currency,
        bankAccountHolder: club.bankAccountHolder,
        bankName: club.bankName,
        iban: club.iban,
        bic: club.bic,
        reference: renderReference(club.paymentReference, {
          name: member.name,
          year: yearBeingPaidFor(member.paidThrough, today(clock)),
        }),
        officeEmail: club.officeEmail,
      };
    },
  };
}

/**
 * The Club's format, with this member's details written into it.
 *
 * **Substitution and nothing else.** A format with no placeholders in it comes back unchanged,
 * and one the treasurer wrote in German or with an em-dash in it is left exactly as written — the
 * reference is the Club's to word, and this only saves a member from copying their own name into
 * a template while standing in a garage.
 */
function renderReference(format: string, member: { name: string; year: number }): string {
  return format.replaceAll('{name}', member.name).replaceAll('{year}', String(member.year));
}

/**
 * Which year a member is paying for.
 *
 * A term they still hold means they are renewing **early**, so what they are buying is the year
 * after the one their term ends in; a term that has run out means they are buying the year they
 * are standing in. That is right for the calendar-year membership almost every club runs, and for
 * anything else it is a guess a human reads off a statement anyway — nothing in this archive ever
 * parses what a member actually typed.
 */
function yearBeingPaidFor(paidThrough: string | null, today: string): number {
  const thisYear = Number(today.slice(0, 4));
  if (paidThrough === null || paidThrough < today) {
    return thisYear;
  }
  return Number(paidThrough.slice(0, 4)) + 1;
}

function toClubRecord(row: ClubRow): ClubRecord {
  return {
    fee: writeAmount(row.fee),
    currency: row.currency,
    bankAccountHolder: row.bankAccountHolder,
    bankName: row.bankName,
    iban: row.iban,
    bic: row.bic,
    paymentReference: row.paymentReference,
    reminderText: row.reminderText,
    officeEmail: row.officeEmail,
  };
}

/** An absent field means "leave it"; a null one means "clear it". The two are not the same. */
function definedOnly(fields: CorrectClubRequest): CorrectClubRequest {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

/** A cleared text field arrives as `""` from a form and means the same thing as nothing at all. */
function blankToNull(value: string | null): string | null {
  return value === null || value.trim() === '' ? null : value.trim();
}
