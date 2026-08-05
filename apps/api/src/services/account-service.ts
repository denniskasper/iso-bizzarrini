import type { PasswordSetup, TokenPurpose } from '@ricambi/contracts';
import { assertPasswordIsAllowed, type PasswordHasher } from '../access/passwords.js';
import type { SignedIn } from '../access/gate.js';
import {
  hashToken,
  issueToken,
  INVITATION_LIFETIME_MS,
  PASSWORD_RESET_LIFETIME_MS,
} from '../access/tokens.js';
import { NotSignedInError, TooManyAttemptsError, ValidationError } from '../http/errors.js';
import type { BreachedPasswordCheck } from '../platform/breached-passwords.js';
import { today, type Clock } from '../platform/clock.js';
import type { EmailSender } from '../platform/email.js';
import type { AccountRepository } from '../repositories/account-repository.js';
import type { SignInFailureRepository } from '../repositories/sign-in-failure-repository.js';
import { invitationEmail, passwordResetEmail } from './member-mail.js';

/**
 * Being a person here: signing in, proving it, and choosing the password that proves it.
 *
 * **Authenticate, then authorise.** Everything in this file answers the first question only. Who
 * is admitted to what — a live Membership for the archive, a role for the roster — is the gate's,
 * and it is deliberately downstream: a lapsed member signs in *successfully* and is turned away
 * afterwards, because they have proved who they are and can therefore be told exactly what is
 * wrong (story 8).
 */

/**
 * **One refusal, for an address nobody has heard of and for the wrong password alike.**
 *
 * The sign-in form must never reveal who is on the roster (story 7): a club of a hundred
 * enthusiasts is a list of names somebody would like to have, and a form that says "no such
 * member" hands it over one address at a time. What replaces the diagnosis is standing guidance
 * — the Club office is a person who can look, and this sentence points at them every time.
 */
const REFUSED =
  'That e-mail address and password do not match. If you are a member of the Club ' +
  'and cannot get in, contact the Club office and they will sort it out.';

/**
 * How many failures inside the window before the address is locked, and for how long.
 *
 * Eight is chosen against the people rather than against the attacker: this is a membership that
 * signs in twice a year on a phone in a cold garage, so three is a rule that locks out members
 * and stops nobody. What actually stops guessing is the lockout that follows, which turns an
 * unlimited number of tries into eight an hour.
 */
const MAX_FAILURES = 8;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

/** Failures nothing is counting any more. Swept on each recorded failure, so it stays bounded. */
const FORGET_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * The least time between two reset e-mails to one address. Not a lockout — the answer to the
 * member is the same either way — but somebody else's inbox is not a thing a stranger gets to
 * fill by pressing a button in a loop.
 */
const RESET_MAIL_INTERVAL_MS = 2 * 60 * 1000;

/**
 * A hash of nothing anybody knows, verified against when there is no Account or no password.
 *
 * Without it the archive answers an unknown address in a millisecond and a known one in three
 * hundred, which is the roster readable by stopwatch — every refusal above this line would be
 * undone by the timing below it.
 */
const DECOY_PASSWORD = 'a-password-that-is-nobody-s';

/** Enough to write a session cookie: who, and which generation of their sessions this is. */
export interface SessionSubject {
  accountId: string;
  epoch: number;
}

export interface AccountService {
  /** Who a session names, or null if the Account is gone or the session belongs to a dead one. */
  identify(accountId: string, epoch: number): Promise<SignedIn | null>;
  /**
   * The same person without the generation check — for the moment *after* signing them in, when
   * the cookie has only just been written and carries the generation by construction.
   */
  describe(accountId: string): Promise<SignedIn | null>;
  /** Who to put in a session, or a refusal that says nothing about the roster. */
  signIn(credentials: { email: string; password: string }): Promise<SessionSubject>;
  /** Sends a reset link if that address is on the roster. Answers the same either way. */
  requestPasswordReset(email: string): Promise<void>;
  /** What is behind a link, before anybody types a password into it. */
  inspectPasswordSetup(token: string): Promise<PasswordSetup>;
  /** The member choosing their own password. Answers who to sign in, at the new generation. */
  redeemPasswordSetup(setup: { token: string; password: string }): Promise<SessionSubject>;
  /** Issues a link and mails it. Used by the roster to invite and to invite again. */
  sendPasswordSetup(accountId: string, purpose: TokenPurpose): Promise<{ expiresAt: Date }>;
}

export function createAccountService(dependencies: {
  clock: Clock;
  accountRepository: AccountRepository;
  signInFailureRepository: SignInFailureRepository;
  passwordHasher: PasswordHasher;
  breachedPasswords: BreachedPasswordCheck;
  emailSender: EmailSender;
  /** Where a browser reaches this system, so a link in an e-mail lands on the right host. */
  publicUrl: string;
}): AccountService {
  const {
    clock,
    accountRepository,
    signInFailureRepository,
    passwordHasher,
    breachedPasswords,
    emailSender,
    publicUrl,
  } = dependencies;

  /**
   * A decoy hashed once, lazily, and then reused. Hashing it on every miss would be honest and
   * would also let somebody make the archive do arbitrary scrypt work by typing addresses.
   */
  let decoy: Promise<string> | null = null;
  const decoyHash = (): Promise<string> => (decoy ??= passwordHasher.hash(DECOY_PASSWORD));

  const service: AccountService = {
    async identify(accountId, epoch) {
      const account = await accountRepository.findById(accountId);
      if (!account) {
        return null;
      }

      // A session from a superseded generation is not a session. This is what makes a reset from
      // a shared computer mean anything (see `session.ts`).
      if (epoch !== account.sessionEpoch) {
        return null;
      }

      return service.describe(account.id);
    },

    async describe(accountId) {
      const account = await accountRepository.findById(accountId);
      if (!account) {
        return null;
      }

      const paidThrough = await accountRepository.paidThrough(account.id);

      return {
        account: {
          id: account.id,
          name: account.name,
          email: account.email,
          role: account.role,
        },
        membershipIsLive: membershipIsLive(paidThrough, today(clock)),
        paidThrough,
      };
    },

    async signIn({ email, password }) {
      const address = normaliseEmail(email);
      const now = clock.now();

      const counted = await signInFailureRepository.find(address);
      if (counted?.lockedUntil && counted.lockedUntil.getTime() > now.getTime()) {
        throw new TooManyAttemptsError(
          'Too many attempts on this address. Wait a quarter of an hour and try again, ' +
            'or contact the Club office.',
        );
      }

      const account = await accountRepository.findByEmail(address);
      // The decoy is verified rather than skipped, so a missing Account and a wrong password cost
      // the same. `verify` is what runs either way; only its input differs.
      const stored = account?.passwordHash ?? (await decoyHash());
      const correct = await passwordHasher.verify(password, stored);

      if (!correct || !account?.passwordHash) {
        await recordFailure(address, now);
        throw new NotSignedInError(REFUSED);
      }

      // Signed in. Whatever was being counted against this address stops being counted — a member
      // who mistyped four times and then got it right starts from nothing next time.
      await signInFailureRepository.forget(address);
      return { accountId: account.id, epoch: account.sessionEpoch };
    },

    async requestPasswordReset(email) {
      const address = normaliseEmail(email);
      const account = await accountRepository.findByEmail(address);
      if (!account) {
        // Nothing to do, nothing to say. The caller answers exactly as it does when there is
        // something to do, which is the whole of not disclosing who is on the roster.
        return;
      }

      const outstanding = await accountRepository.findOutstandingToken(
        account.id,
        'password-reset',
      );
      const sentRecently =
        outstanding !== null &&
        clock.now().getTime() - outstanding.issuedAt.getTime() < RESET_MAIL_INTERVAL_MS;

      if (!sentRecently) {
        await service.sendPasswordSetup(account.id, 'password-reset');
      }
    },

    async inspectPasswordSetup(token) {
      const { account, purpose } = await readSetup(token);
      return { purpose, name: account.name, email: account.email };
    },

    async redeemPasswordSetup({ token, password }) {
      const { account, tokenId } = await readSetup(token);

      // The password is checked *before* the link is spent, so a member who chooses one that is
      // too short still has their link. Otherwise the first mistake would cost them the
      // invitation and a message to the Club office.
      assertPasswordIsAllowed(password);
      if (await breachedPasswords.isBreached(password)) {
        throw new ValidationError(
          'That password has appeared in a known data breach, so it is one of the passwords ' +
            'attackers try first. Choose another — length is what helps, not punctuation.',
        );
      }

      const hash = await passwordHasher.hash(password);
      const now = clock.now();

      // Single use, and this is where it is spent. A second redemption of the same link updates
      // no rows and is refused, which is what makes a forwarded e-mail useless (story 4).
      if (!(await accountRepository.redeemToken(tokenId, now))) {
        throw refusedLink();
      }

      // The generation moves here, and the caller signs the browser in at the new one — so this
      // browser survives and every other one that was signed in as this member does not.
      const updated = await accountRepository.setPassword(account.id, hash, now);
      return { accountId: updated.id, epoch: updated.sessionEpoch };
    },

    async sendPasswordSetup(accountId, purpose) {
      const account = await accountRepository.findById(accountId);
      if (!account) {
        throw new Error(`No Account ${accountId} to send a ${purpose} to.`);
      }

      const now = clock.now();
      const lifetime =
        purpose === 'invitation' ? INVITATION_LIFETIME_MS : PASSWORD_RESET_LIFETIME_MS;
      const expiresAt = new Date(now.getTime() + lifetime);

      const { token, tokenHash } = issueToken();
      const issued = await accountRepository.issueToken({
        accountId: account.id,
        purpose,
        tokenHash,
        issuedAt: now,
        expiresAt,
      });

      const link = `${publicUrl.replace(/\/+$/, '')}/set-password?token=${encodeURIComponent(token)}`;
      const letter = { to: account.email, name: account.name, link, expiresAt };

      try {
        await emailSender.send(
          purpose === 'invitation' ? invitationEmail(letter) : passwordResetEmail(letter),
        );
      } catch (error) {
        /**
         * **A link nobody was told about does not stay live.**
         *
         * The token has to exist before the letter can carry it, so a send that fails leaves a
         * usable secret behind that reached no inbox — and, worse, leaves the roster reporting an
         * outstanding invitation with the instant it was "sent". Spending it here makes the two
         * agree again: nothing was sent, and there is nothing outstanding.
         */
        await accountRepository.redeemToken(issued.id, now);
        throw error;
      }

      return { expiresAt };
    },
  };

  async function readSetup(token: string) {
    const row = await accountRepository.findLiveToken(hashToken(token), clock.now());
    if (!row) {
      throw refusedLink();
    }

    const account = await accountRepository.findById(row.accountId);
    if (!account) {
      throw refusedLink();
    }

    return { account, purpose: row.purpose, tokenId: row.id };
  }

  async function recordFailure(address: string, now: Date): Promise<void> {
    const counted = await signInFailureRepository.record(address, now, {
      since: new Date(now.getTime() - FAILURE_WINDOW_MS),
    });

    if (counted.failures >= MAX_FAILURES) {
      await signInFailureRepository.lockUntil(address, new Date(now.getTime() + LOCKOUT_MS));
    }

    await signInFailureRepository.forgetOlderThan(new Date(now.getTime() - FORGET_AFTER_MS));
  }

  return service;
}

/**
 * **The rule the whole gate turns on**, in one place: at least one Membership whose Paid-through
 * has not passed. `paidThrough` is the last day the term covers, so the day itself still reads.
 */
export function membershipIsLive(paidThrough: string | null, today: string): boolean {
  return paidThrough !== null && paidThrough >= today;
}

/**
 * One address per person. `A@club.example` and `a@club.example` are the same member, and a roster
 * that thought otherwise would invite them twice and let neither of them in.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function refusedLink(): ValidationError {
  // The same answer for a link that never existed, one that has expired and one already used.
  // Which of the three it is would tell a stranger holding a guessed token something true.
  return new ValidationError(
    'That link has expired or has already been used. Ask the Club office to send another.',
  );
}
