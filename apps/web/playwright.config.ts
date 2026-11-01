import { fileURLToPath, URL } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * The second seam: the built application, served by the API, driven in a real browser.
 *
 * Deliberately thin. It is here for what the API seam cannot see — the drawing viewer fitting
 * to screen, a Mark landing on the right Position, a deep link surviving the sign-in redirect.
 * Everything a request and a response can prove belongs at the API seam instead.
 */
const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
const webDistPath = fileURLToPath(new URL('./dist', import.meta.url));

const databaseUrl =
  process.env.E2E_DATABASE_URL ?? 'postgres://ricambi:ricambi@localhost:5433/ricambi_e2e';

/** What the seeded practice members sign in with. Known to this suite and to nothing else. */
const practicePassword = process.env.E2E_MEMBER_PASSWORD ?? 'a-practice-members-passphrase';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['list'], ['junit', { outputFile: 'test-results/e2e.junit.xml' }]]
    : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // A member sends another member a link to the Position they are looking at (story 52), and
    // what the button actually put on the clipboard is the only thing worth asserting about it.
    // Granted rather than mocked: both projects are Chromium, and 127.0.0.1 is a secure origin.
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The archive is used on a phone in a garage, so the small screen is not an afterthought.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: [
      'pnpm --filter @ricambi/web build',
      'pnpm --filter @ricambi/api build',
      'pnpm --filter @ricambi/api db:seed',
      'pnpm --filter @ricambi/api start',
    ].join(' && '),
    url: `${baseURL}/api/status`,
    // Never reuse a server that is already listening. The point of this seam is to exercise
    // the *built* app, and a leftover process quietly serving a stale build turns a green run
    // into a lie — which is exactly what it did once already.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'production',
      ENVIRONMENT_NAME: 'end-to-end',
      // Declared, not defaulted: the seeder empties tables and will only do that for a system
      // that has said out loud what it is. The default itself is covered at the API seam.
      ENVIRONMENT_MODE: 'non-production',
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      WEB_DIST_PATH: webDistPath,
      LOG_LEVEL: 'warn',
      SESSION_SECRET: 'an-end-to-end-session-secret-long-enough',
      // Blank, so a developer's `.env` cannot sign the suite in: it is here to meet the form.
      DEV_SIGN_IN_AS: '',
      // Members sign in with their own passwords (ticket 14), so the suite adds people to the
      // roster and reads the invitation out of the log. `log` is what puts it there.
      EMAIL_TRANSPORT: 'log',
      // The built app is served by the API here, so an invitation link points at this server.
      PUBLIC_URL: baseURL,
      // **No third party is reached from a test run.** The breached-password rule is proved at
      // the API seam against a list the suite writes; what this seam is for is the browser.
      BREACHED_PASSWORD_CHECK: 'none',
      // The generated roster is left unable to sign in unless this says otherwise, so that no
      // password committed to this repository works on a practice system deployed from it. This
      // seam is the thing that needs one, so this seam is where it is said.
      PRACTICE_MEMBER_PASSWORD: practicePassword,
      // The practice Reading method (issue #55): no model is reached from a test run either.
      READING_METHOD: 'fake',
      CLAUDE_CODE_OAUTH_TOKEN: '',
      ANTHROPIC_API_KEY: '',
      // The practice conversation (issue #152), which answers fixed text: no model either.
      PROPOSALS_METHOD: 'fake',
      PROPOSALS_MONTHLY_LIMIT_USD: '25',
      PROPOSALS_ANTHROPIC_API_KEY: '',
      // The scans this run ingests, thrown away with the rest of the run's output.
      FILE_STORAGE_PATH: fileURLToPath(new URL('./test-results/files', import.meta.url)),
    },
  },
});
