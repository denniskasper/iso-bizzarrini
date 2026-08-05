import { expect, type Page } from '@playwright/test';

/**
 * Getting in, the way somebody actually does: by typing into the real form. **No test here is
 * handed a cookie** — the gate is in front of every screen, so a suite that stepped around it
 * would be exercising an application nobody can reach.
 *
 * **Everything here goes through the real gate**, as of ticket 14. The stand-in passphrase is
 * still a credential the archive accepts, and it is deliberately not on any screen — the way an
 * operator uses it is `roster:invite-administrator`, which is a command run once on the box. A
 * form advertising a shared passphrase to every stranger who found it would be worse than the
 * problem it solves.
 */

/** What the seeded practice members sign in with. Set by the Playwright config. */
export const MEMBER_PASSWORD = process.env.E2E_MEMBER_PASSWORD ?? 'a-practice-members-passphrase';

/** Who the seeded roster holds, and what state each of them is in. See `practice-roster.ts`. */
export const PRACTICE = {
  administrator: 'ada@example.invalid',
  editor: 'bruno@example.invalid',
  member: 'clara@example.invalid',
  /** Signed in, paid up to a date that has passed. */
  lapsed: 'elena@example.invalid',
  /** On the roster, never chose a password. */
  invited: 'dario@example.invalid',
} as const;

/**
 * In as somebody who may edit the archive and keep the roster — which is what almost every test
 * in this suite needs, because almost every test is about a screen an Editor works on.
 */
export async function signIn(page: Page): Promise<void> {
  await signInAs(page, PRACTICE.administrator);
  await landed(page);
}

/** In as a person, with an address and a password of their own (ticket 14). */
export async function signInAs(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('E-mail address').fill(email);
  await page.getByLabel('Password').fill(MEMBER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/**
 * **The click is not the sign-in.** The gate screen leaves for the catalog only once the archive
 * has answered and the session cookie is in the browser's jar, and until that has happened every
 * request a caller makes is refused — `page.request` included, because it shares that jar. Two
 * dozen tests call this and then immediately ask for `/api/models`, where a 401 arrives as
 * `{ error }` and reads as `Cannot read properties of undefined`.
 *
 * The catalog's own heading is the wait, because it is the first thing that cannot be on screen
 * unless the archive really did let this browser in. What was here before — that the members-only
 * heading is absent — is true of the sign-in screen as well, so it was answered before the
 * passphrase had been sent anywhere and never made anybody wait for anything.
 */
export async function landed(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Covered cars' })).toBeVisible();
}
