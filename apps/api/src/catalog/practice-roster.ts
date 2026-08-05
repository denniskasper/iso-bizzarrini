import { sql } from 'drizzle-orm';
import { createPasswordHasher } from '../access/passwords.js';
import type { Db } from '../db/client.js';
import { accounts, accountTokens, club, memberships, signInFailures } from '../db/schema.js';
import type { Clock } from '../platform/clock.js';

/**
 * An invented membership, for a system that is not the archive.
 *
 * **Nobody here is real, and nothing here was copied.** Every name and every address is written
 * in this file, and the addresses are all on `example.invalid` — a domain reserved by RFC 2606
 * precisely so that nothing can be delivered to it. The most common way a club leaks its own
 * roster is a demo loaded from production, and the only reliable defence is that the loading path
 * does not exist.
 *
 * The point of it is the **three states** (story 124). A practice roster in which everybody is
 * paid up and signing in would be a practice roster nobody could use to check that the screen
 * answers "I paid, why can't I get in".
 */
export interface PracticeMember {
  name: string;
  email: string;
  role: 'member' | 'editor' | 'administrator';
  /** Days from today. Negative is a Membership that ran out that long ago. */
  paidThroughInDays: number;
  /** Whether they have redeemed an invitation and chosen a password. */
  activated: boolean;
}

const MEMBERS: readonly PracticeMember[] = [
  {
    name: 'Ada Ferrante',
    email: 'ada@example.invalid',
    role: 'administrator',
    paidThroughInDays: 300,
    activated: true,
  },
  {
    name: 'Bruno Salvi',
    email: 'bruno@example.invalid',
    role: 'editor',
    paidThroughInDays: 200,
    activated: true,
  },
  {
    name: 'Clara Weiss',
    email: 'clara@example.invalid',
    role: 'member',
    paidThroughInDays: 120,
    activated: true,
  },
  // Added and never got round to it: the state the roster screen calls **invited**.
  {
    name: 'Dario Lanza',
    email: 'dario@example.invalid',
    role: 'member',
    paidThroughInDays: 90,
    activated: false,
  },
  // Ran out a fortnight ago: **lapsed**, and the row an Administrator is usually looking for.
  {
    name: 'Elena Moretti',
    email: 'elena@example.invalid',
    role: 'member',
    paidThroughInDays: -14,
    activated: true,
  },
  // Lapsed *and* never activated, which is the case that proves lapsed wins over invited.
  {
    name: 'Franco Bianchi',
    email: 'franco@example.invalid',
    role: 'member',
    paidThroughInDays: -400,
    activated: false,
  },
];

/** What the invented Club says about itself. A bank nobody can pay and a fee nobody is charged. */
const CLUB = {
  fee: 4500,
  currency: 'EUR' as const,
  bankAccountHolder: 'A Practice Association',
  bankName: 'A Practice Bank',
  iban: 'DE00 0000 0000 0000 0000 00',
  bic: 'PRACTICE0',
  paymentReference: 'Ricambi {year} {name}',
  reminderText:
    'Your Club membership runs out shortly. Renewing keeps your access to the parts archive.',
};

export interface PracticeRosterOutcome {
  members: number;
  activated: number;
}

/**
 * Writes the invented roster, emptying whatever was there first.
 *
 * **A password is written only if one was handed in**, and that is the whole of the safety
 * argument. A known password committed to this repository would work on every practice system
 * ever deployed from it, so there is not one: `pnpm db:seed` leaves every generated member
 * unactivated unless `PRACTICE_MEMBER_PASSWORD` says otherwise, and the browser seam — which
 * needs to sign one of them in — is the thing that says so.
 *
 * The caller is `scripts/seed.ts`, which has already been through `assertSeedable`: this empties
 * tables, and emptying the *accounts* table on the archive would take away the membership.
 */
export async function writePracticeRoster(dependencies: {
  db: Db;
  clock: Clock;
  /** Undefined leaves everybody unactivated, which is the safe answer and the default. */
  password: string | undefined;
}): Promise<PracticeRosterOutcome> {
  const { db, clock, password } = dependencies;
  const now = clock.now();

  await emptyRoster(db);

  await db.insert(club).values({ ...CLUB, updatedAt: now });

  const hasher = createPasswordHasher();
  const hash = password === undefined ? undefined : await hasher.hash(password);

  let activated = 0;
  for (const member of MEMBERS) {
    const takesPart = member.activated && hash !== undefined;

    const [row] = await db
      .insert(accounts)
      .values({
        name: member.name,
        email: member.email,
        role: member.role,
        passwordHash: takesPart ? hash : null,
        passwordSetAt: takesPart ? now : null,
        addedAt: now,
      })
      .returning();

    if (!row) {
      throw new Error(`Inserting the practice member ${member.email} returned nothing.`);
    }
    if (takesPart) {
      activated += 1;
    }

    await db.insert(memberships).values({
      accountId: row.id,
      paidThrough: dayOffsetFrom(now, member.paidThroughInDays),
      grantedBy: 'opening-entry',
      recordedAt: now,
    });
  }

  return { members: MEMBERS.length, activated };
}

/** Everything the roster is made of, in an order the foreign keys allow. */
export async function emptyRoster(db: Db): Promise<void> {
  await db.delete(accountTokens);
  await db.delete(memberships);
  await db.delete(accounts);
  await db.delete(signInFailures);
  await db.execute(sql`delete from ${club}`);
}

/** `YYYY-MM-DD`, so many days on from an instant. Days, because a Membership runs in days. */
function dayOffsetFrom(now: Date, days: number): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
