/**
 * **The way into a system with an empty roster**, run on the box, once.
 *
 * Ticket 15 removed the shared passphrase, so there is no other door: an Administrator adds
 * everybody else, and this is what adds the Administrator. What it does is in
 * `composition/first-administrator.ts`, which is where it can be tested; what is here is the
 * command line around it and the environment it opens.
 *
 *   pnpm --filter @ricambi/api roster:invite-administrator -- \
 *     --name "A Person" --email person@example.org --paid-through 2027-12-31
 *
 * **It lives under `src/` so that it is compiled into the image.** A deployment has no `tsx` and
 * no `scripts/` folder, and a way in that only runs on a laptop is not a way into a deployment:
 *
 *   node dist/cli/invite-administrator.js --name "A Person" --email person@example.org
 *
 * It is meant to be run against production, which is the point of it. It sets no password: the
 * person it names chooses their own from the invitation, and neither the operator nor this script
 * ever sees it.
 */
import { parseArgs } from 'node:util';
import { assertSafeForEnvironment } from '../composition/environment-safety.js';
import { inviteAdministrator } from '../composition/first-administrator.js';
import {
  createBreachedPasswordCheck,
  createEmailSender,
  createPaymentProvider,
} from '../composition/platform.js';
import { loadConfig } from '../config/config.js';
import { loadEnvFile } from '../config/env-file.js';
import { createDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { systemClock } from '../platform/clock.js';
import { createLogger } from '../platform/logger.js';

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
  paymentProvider: createPaymentProvider(config, systemClock),
});

const database = createDatabase(config.databaseUrl, { maxConnections: 1 });

try {
  // The same step the application takes when it boots, for the same reason: this must not be the
  // command that discovers the schema was never applied.
  await runMigrations(database.db);

  const { member, promoted } = await inviteAdministrator(
    {
      db: database.db,
      clock: systemClock,
      logger,
      emailSender,
      breachedPasswords: createBreachedPasswordCheck(config, logger),
      publicUrl: config.publicUrl,
      renewalGraceDays: config.renewalGraceDays,
    },
    {
      name: values.name,
      email: values.email,
      ...(values['paid-through'] === undefined ? {} : { paidThrough: values['paid-through'] }),
    },
  );

  console.log(
    `${promoted ? 'Promoted' : 'Added'} ${member.name} <${member.email}> as an Administrator, ` +
      `paid through ${member.paidThrough}.\n` +
      'An invitation has been sent. They choose their own password, and nobody else ever sees it.',
  );
} finally {
  await database.close();
}
