import type { RosterEntry } from '@ricambi/contracts';
import { createPasswordHasher, type PasswordHasher } from '../access/passwords.js';
import type { Db } from '../db/client.js';
import type { BreachedPasswordCheck } from '../platform/breached-passwords.js';
import type { Clock } from '../platform/clock.js';
import type { EmailSender } from '../platform/email.js';
import type { Logger } from '../platform/logger.js';
import { createAccountRepository } from '../repositories/account-repository.js';
import { createSignInFailureRepository } from '../repositories/sign-in-failure-repository.js';
import { createAccountService } from '../services/account-service.js';
import { createRosterService } from '../services/roster-service.js';

/**
 * **How the first Administrator comes to exist**, now that nothing else can let anybody in.
 *
 * An Administrator adds people to the roster. Until ticket 14 the answer to "who adds the first
 * one" was the stand-in Editor gate — one shared passphrase — and ticket 15 has taken that away,
 * which leaves this as the only door into a system with an empty roster. That is why it is a
 * function rather than a page of wiring inside a script: a bootstrap nothing exercises is a
 * bootstrap that is discovered to be broken by the one person who cannot get in.
 *
 * It is better than the passphrase was in the way that matters: **it sets no password**. It puts
 * a person on the roster and sends them an invitation exactly as the roster screen does, and they
 * choose their own. Neither the operator who runs it nor this file ever knows it.
 *
 * Somebody already on the roster is **promoted and invited again** rather than duplicated, so
 * running it twice is not a way to end up with two of anybody.
 */
export interface AdministratorToInvite {
  name: string;
  email: string;
  /** The opening term the Club asserts they are paid up to. A year from now where unsaid. */
  paidThrough?: string;
}

export interface InvitedAdministrator {
  member: RosterEntry;
  /** They were already on the roster, so they were promoted rather than added. */
  promoted: boolean;
}

export async function inviteAdministrator(
  dependencies: {
    db: Db;
    clock: Clock;
    logger: Logger;
    emailSender: EmailSender;
    breachedPasswords: BreachedPasswordCheck;
    /** Where a browser reaches this system, so the link in the invitation lands on it. */
    publicUrl: string;
    /** The real scrypt unless a caller can afford a cheaper one, which only a test can. */
    passwordHasher?: PasswordHasher;
  },
  person: AdministratorToInvite,
): Promise<InvitedAdministrator> {
  const { db, clock, logger, emailSender, breachedPasswords, publicUrl } = dependencies;

  const accountRepository = createAccountRepository(db);
  const accountService = createAccountService({
    clock,
    accountRepository,
    signInFailureRepository: createSignInFailureRepository(db),
    passwordHasher: dependencies.passwordHasher ?? createPasswordHasher(),
    breachedPasswords,
    emailSender,
    publicUrl,
  });
  const rosterService = createRosterService({ clock, accountRepository, accountService, logger });

  const email = person.email.trim().toLowerCase();
  const existing = await accountRepository.findByEmail(email);

  if (existing) {
    await rosterService.correct(existing.id, { name: person.name, role: 'administrator' });
    return { member: await rosterService.invite(existing.id), promoted: true };
  }

  const member = await rosterService.add({
    name: person.name,
    email,
    paidThrough: person.paidThrough ?? aYearOn(clock),
    role: 'administrator',
  });

  return { member, promoted: false };
}

/** The opening term where nobody said one. A year, which is what a Membership normally runs for. */
function aYearOn(clock: Clock): string {
  const now = clock.now();
  return new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}
