/**
 * **How the first Administrator comes to exist.**
 *
 * An Administrator adds people to the roster, and until ticket 14 the only answer to "who adds
 * the first one" was the stand-in Editor gate — one shared passphrase. The sign-in screen no
 * longer offers that, because a form advertising a shared passphrase to every stranger who finds
 * it is worse than the problem it solves.
 *
 * So the bootstrap is a command an operator runs **on the box, once**, and it is better than the
 * passphrase was in the way that matters: it sets no password. It puts a person on the roster and
 * sends them an invitation, exactly as the roster screen does, and that person then chooses their
 * own password like everybody else. Neither the operator nor this script ever knows it.
 *
 *   pnpm --filter @ricambi/api roster:invite-administrator -- \
 *     --name "A Person" --email person@example.org --paid-through 2027-12-31
 *
 * It is meant to be run against production, which is the point of it. Somebody already on the
 * roster is **promoted and invited again** rather than duplicated, so running it twice is not a
 * way to end up with two of anybody.
 */
import { parseArgs } from 'node:util';
import { createPasswordHasher } from '../src/access/passwords.js';
import { assertSafeForEnvironment } from '../src/composition/environment-safety.js';
import {
  createBreachedPasswordCheck,
  createEmailSender,
  createPaymentProvider,
} from '../src/composition/platform.js';
import { loadConfig } from '../src/config/config.js';
import { loadEnvFile } from '../src/config/env-file.js';
import { createDatabase } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { systemClock } from '../src/platform/clock.js';
import { createLogger } from '../src/platform/logger.js';
import { createAccountRepository } from '../src/repositories/account-repository.js';
import { createSignInFailureRepository } from '../src/repositories/sign-in-failure-repository.js';
import { createAccountService } from '../src/services/account-service.js';
import { createRosterService } from '../src/services/roster-service.js';

const { values } = parseArgs({
  // `pnpm roster:invite-administrator -- --name …` hands the `--` down to the script, where it
  // would otherwise end option parsing and turn every flag after it into a positional. Dropping
  // it is what makes the documented invocation the one that works.
  args: process.argv.slice(2).filter((token) => token !== '--'),
  options: {
    name: { type: 'string' },
    email: { type: 'string' },
    'paid-through': { type: 'string' },
  },
});

if (!values.name || !values.email) {
  console.error(
    'Usage: roster:invite-administrator --name "A Person" --email person@example.org ' +
      '[--paid-through YYYY-MM-DD]',
  );
  process.exit(1);
}

loadEnvFile();
const config = loadConfig();
const logger = createLogger(config);
const emailSender = createEmailSender(config, logger);

// ADR 0012: an entry point that does not build the application owes the environment guard a call
// of its own, or it is a way into the environment that nothing checked. **This one is meant for
// production** — it is how the real archive gets its first Administrator — so what it checks for
// is a practice system holding something that can reach a real person.
assertSafeForEnvironment({
  config,
  emailSender,
  paymentProvider: createPaymentProvider(config),
});

const database = createDatabase(config.databaseUrl, { maxConnections: 1 });

try {
  // The same step the application takes when it boots, for the same reason: this must not be the
  // command that discovers the schema was never applied.
  await runMigrations(database.db);

  const accountRepository = createAccountRepository(database.db);
  const accountService = createAccountService({
    clock: systemClock,
    accountRepository,
    signInFailureRepository: createSignInFailureRepository(database.db),
    passwordHasher: createPasswordHasher(),
    breachedPasswords: createBreachedPasswordCheck(config, logger),
    emailSender,
    publicUrl: config.publicUrl,
  });

  const rosterService = createRosterService({
    clock: systemClock,
    accountRepository,
    accountService,
    logger,
  });

  const email = values.email.trim().toLowerCase();
  const existing = await accountRepository.findByEmail(email);

  const member = existing
    ? await rosterService
        .correct(existing.id, { name: values.name, role: 'administrator' })
        .then(() => rosterService.invite(existing.id))
    : await rosterService.add({
        name: values.name,
        email,
        paidThrough: values['paid-through'] ?? aYearFromNow(),
        role: 'administrator',
      });

  console.log(
    `${existing ? 'Promoted' : 'Added'} ${member.name} <${member.email}> as an Administrator, ` +
      `paid through ${member.paidThrough}.\n` +
      'An invitation has been sent. They choose their own password, and nobody else ever sees it.',
  );
} finally {
  await database.close();
}

function aYearFromNow(): string {
  const now = systemClock.now();
  return new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}
