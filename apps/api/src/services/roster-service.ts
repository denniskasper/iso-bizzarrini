import type {
  CorrectMemberRequest,
  NewMemberRequest,
  RecordPaymentRequest,
  RosterEntry,
  RosterStanding,
} from '@ricambi/contracts';
import { violates } from '../db/constraints.js';
import type { AccountRow, AccountTokenRow } from '../db/schema.js';
import {
  ConflictError,
  InvitationNotSentError,
  NotFoundError,
  ValidationError,
} from '../http/errors.js';
import { today, type Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import type { AccountRepository } from '../repositories/account-repository.js';
import { membershipIsLive, normaliseEmail } from './account-service.js';
import type { AccountService } from './account-service.js';
import { readDay } from './days.js';
import { readAmount } from './money.js';

/**
 * The roster: who the Club has, where each of them stands, and the two things an Administrator
 * does about it — invite somebody, and record that they have paid.
 *
 * **"I paid, why can't I get in" is the question this exists to answer** (story 124), and the
 * answer is almost always one of three states rather than a fault. They are not on the roster;
 * they are on it and have never chosen a password; or their Membership has run out. An
 * Administrator can see which without opening a database and without anyone guessing.
 */
export interface RosterService {
  list(): Promise<RosterEntry[]>;
  add(member: NewMemberRequest): Promise<RosterEntry>;
  /** Sends the invitation again, to somebody who missed it or whose link expired (story 5). */
  invite(accountId: string): Promise<RosterEntry>;
  correct(accountId: string, fields: CorrectMemberRequest): Promise<RosterEntry>;
  /** Money that arrived by bank transfer. Grants a new term rather than editing an old one. */
  recordPayment(
    accountId: string,
    payment: RecordPaymentRequest,
    recordedBy: string | null,
  ): Promise<RosterEntry>;
}

export function createRosterService(dependencies: {
  clock: Clock;
  accountRepository: AccountRepository;
  accountService: AccountService;
  logger: Logger;
}): RosterService {
  const { clock, accountRepository, accountService, logger } = dependencies;

  return {
    async list() {
      // Three queries for the whole roster rather than three per person: a hundred members is
      // small, and a screen that grows a query per row is a screen that stops working quietly.
      const [rows, paidThrough, invitations] = await Promise.all([
        accountRepository.listAll(),
        accountRepository.paidThroughForEveryone(),
        accountRepository.outstandingInvitations(clock.now()),
      ]);

      const now = today(clock);
      return rows.map((row) =>
        toRosterEntry(row, paidThrough.get(row.id) ?? null, invitations.get(row.id) ?? null, now),
      );
    },

    /**
     * An Administrator adds a person and **the invitation goes out with them** (story 121).
     * Adding somebody who is never told is a row that answers "invited" and has invited nobody.
     */
    async add(member) {
      const email = normaliseEmail(member.email);
      if (!email.includes('@')) {
        throw new ValidationError('That is not an e-mail address the Club could write to.');
      }

      const paidThrough = readDay(member.paidThrough, 'a Paid-through date');
      const now = clock.now();

      let account: AccountRow;
      try {
        account = await accountRepository.add({
          email,
          name: member.name.trim(),
          role: member.role ?? 'member',
          addedAt: now,
        });
      } catch (error) {
        if (violates(error, 'accounts_email_unique')) {
          throw new ConflictError(
            'Somebody with that e-mail address is already on the roster. ' +
              'Send them the invitation again rather than adding them twice.',
          );
        }
        throw error;
      }

      // The opening term: the Administrator asserting what the Club has already been paid for,
      // which is how a roster that predates this system arrives in it.
      await accountRepository.grantMembership({
        accountId: account.id,
        paidThrough,
        grantedBy: 'opening-entry',
        recordedAt: now,
      });

      /**
       * **The person is on the roster whether or not the letter got out.**
       *
       * The e-mail sender is an external edge, and the way it fails on a laptop is the ordinary
       * way: `EMAIL_TRANSPORT` is unset, so it refuses. Letting that bubble up as a 500 would be
       * the worst of both — the Account and its Membership are already written, so the
       * Administrator sees a failure, tries again, and is told the address is already taken.
       *
       * So the write stands and the refusal says exactly what happened. The roster shows them as
       * invited with no outstanding link, and "Send the invitation again" is the fix, sitting on
       * their row.
       */
      try {
        await accountService.sendPasswordSetup(account.id, 'invitation');
      } catch (error) {
        logger.error(
          { err: error, accountId: account.id },
          'Added a member to the roster but could not send their invitation',
        );
        throw new InvitationNotSentError(email);
      }

      return read(account.id);
    },

    async invite(accountId) {
      const account = await find(accountId);
      await accountService.sendPasswordSetup(account.id, 'invitation');
      return read(account.id);
    },

    async correct(accountId, fields) {
      const account = await find(accountId);

      const name = fields.name?.trim();
      if (name !== undefined && name === '') {
        throw new ValidationError('A member needs a name.');
      }

      await accountRepository.correct(account.id, {
        ...(name === undefined ? {} : { name }),
        ...(fields.role === undefined ? {} : { role: fields.role }),
      });

      return read(account.id);
    },

    /**
     * **A new row, never an edit** (story 125). The term that was granted is what the Club was
     * paid for, and the statutory retention period (ADR 0007) has to have something to retain;
     * moving a date in place would leave the money with no record of what it bought.
     */
    async recordPayment(accountId, payment, recordedBy) {
      const account = await find(accountId);
      const now = clock.now();

      const paidThrough = readDay(payment.paidThrough, 'a Paid-through date');
      const receivedOn = readDay(payment.receivedOn, 'a date the money arrived');
      if (receivedOn > today(clock)) {
        throw new ValidationError('Money cannot have arrived on a date that has not happened.');
      }

      const current = await accountRepository.paidThrough(account.id);
      if (current !== null && paidThrough <= current) {
        throw new ValidationError(
          `This Membership already runs to ${current}. A recorded payment moves that date ` +
            'forward; if it has been entered already, there is nothing to record.',
        );
      }

      const amount = payment.amount === null ? null : readAmount(payment.amount);
      if (payment.amount !== null && (amount === null || amount <= 0)) {
        throw new ValidationError(
          'An amount is a figure — 45, 45.00 or 45,50. Leave it blank if no money changed hands.',
        );
      }

      await accountRepository.grantMembership({
        accountId: account.id,
        paidThrough,
        grantedBy: 'bank-transfer',
        amount,
        currency: amount === null ? null : payment.currency,
        receivedOn,
        reference: payment.reference?.trim() || null,
        recordedBy,
        recordedAt: now,
      });

      return read(account.id);
    },
  };

  async function find(accountId: string): Promise<AccountRow> {
    const account = await accountRepository.findById(accountId);
    if (!account) {
      throw new NotFoundError('Nobody on the roster has that id.');
    }
    return account;
  }

  async function read(accountId: string): Promise<RosterEntry> {
    const account = await find(accountId);
    const [paidThrough, invitation] = await Promise.all([
      accountRepository.paidThrough(account.id),
      accountRepository.findOutstandingToken(account.id, 'invitation'),
    ]);

    return toRosterEntry(account, paidThrough, invitation, today(clock));
  }
}

/**
 * The three states, and the order they are decided in.
 *
 * **Lapsed wins**, because it is the one that stops somebody reading the archive: a person who
 * never chose a password *and* whose term has run out cannot get in for both reasons, and the one
 * an Administrator has to fix first is the money. `activatedAt` and `invitationSentAt` are on the
 * row beside it, so a screen never has to infer what it was not told.
 */
export function standingOf(
  account: AccountRow,
  paidThrough: string | null,
  today: string,
): RosterStanding {
  if (!membershipIsLive(paidThrough, today)) {
    return 'lapsed';
  }
  return account.passwordSetAt === null ? 'invited' : 'active';
}

function toRosterEntry(
  account: AccountRow,
  paidThrough: string | null,
  invitation: AccountTokenRow | null,
  today: string,
): RosterEntry {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    standing: standingOf(account, paidThrough, today),
    paidThrough,
    activatedAt: account.passwordSetAt?.toISOString() ?? null,
    invitationSentAt: invitation?.issuedAt.toISOString() ?? null,
    invitationExpiresAt: invitation?.expiresAt.toISOString() ?? null,
    addedAt: account.addedAt.toISOString(),
  };
}
