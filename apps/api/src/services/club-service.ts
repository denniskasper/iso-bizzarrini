import type { ClubRecord, CorrectClubRequest } from '@ricambi/contracts';
import { violates } from '../db/constraints.js';
import type { ClubRow } from '../db/schema.js';
import { ValidationError } from '../http/errors.js';
import type { Clock } from '../platform/clock.js';
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
};

export interface ClubService {
  read(): Promise<ClubRecord>;
  correct(fields: CorrectClubRequest): Promise<ClubRecord>;
}

export function createClubService(dependencies: {
  clock: Clock;
  clubRepository: ClubRepository;
}): ClubService {
  const { clock, clubRepository } = dependencies;

  return {
    async read() {
      const row = await clubRepository.read();
      return row === null ? UNWRITTEN : toClubRecord(row);
    },

    /**
     * A patch over whatever is there, so a screen that changes the IBAN does not have to send
     * the reminder text back to keep it. Where nothing is there yet, the unwritten Club is what
     * is patched — the first save is the same operation as the hundredth.
     */
    async correct(fields) {
      const current = await this.read();
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
  };
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
