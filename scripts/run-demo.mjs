import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

/**
 * The non-production system, on a laptop and in one command.
 *
 * It is the real thing rather than a preview: the *built* app served by the API from one origin,
 * exactly as a deployment serves it, with its own database, its own generated catalog, and
 * `ENVIRONMENT_MODE=non-production` — which is what puts the banner on every page, DEMO in the
 * title, and the refusals in front of the e-mail sender, the payment provider and the reminders.
 *
 * Deploying it beside production is then configuration and not rework: the same image, the same
 * variables, a different database. That lands with ticket 14, which carries the first deployment
 * and the sign-in gate both systems sit behind.
 */
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

const environment = {
  ...process.env,
  NODE_ENV: 'production',
  ENVIRONMENT_MODE: 'non-production',
  ENVIRONMENT_NAME: process.env.DEMO_ENVIRONMENT_NAME ?? 'demo',
  PORT: process.env.DEMO_PORT ?? '3200',
  // Its own database, always. A practice system that shares one with anything else is not a
  // practice system, and the seeder truncates what it finds.
  DATABASE_URL:
    process.env.DEMO_DATABASE_URL ?? 'postgres://ricambi:ricambi@localhost:5433/ricambi_demo',
  WEB_DIST_PATH: fileURLToPath(new URL('../apps/web/dist', import.meta.url)),
};

run('pnpm', ['setup']);
run('pnpm', ['db:up']);
run('pnpm', ['build']);
run('pnpm', ['--filter', '@ricambi/api', 'db:seed']);

process.stdout.write(`\nThe practice archive is at http://localhost:${environment.PORT}\n\n`);
run('pnpm', ['--filter', '@ricambi/api', 'start']);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
