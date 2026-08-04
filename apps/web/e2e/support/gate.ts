import { expect, type Page } from '@playwright/test';

/**
 * Getting through the stand-in Editor gate, the way a member does: by typing the passphrase
 * into the real form. No test here is handed a cookie — the gate is in front of every screen,
 * so a suite that stepped around it would be exercising an application nobody can reach.
 */
export const PASSPHRASE = process.env.E2E_EDITOR_PASSWORD ?? 'an-end-to-end-passphrase';

export async function signIn(page: Page): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Passphrase').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  /**
   * **The click is not the sign-in.** The gate screen leaves for the catalog only once the
   * archive has answered and the session cookie is in the browser's jar, and until that has
   * happened every request a caller makes is refused — `page.request` included, because it
   * shares that jar. Two dozen tests call this and then immediately ask for `/api/models`,
   * where a 401 arrives as `{ error }` and reads as `Cannot read properties of undefined`.
   *
   * The catalog's own heading is the wait, because it is the first thing that cannot be on
   * screen unless the archive really did let this browser in. What was here before — that the
   * members-only heading is absent — is true of the sign-in screen as well, so it was answered
   * before the passphrase had been sent anywhere and never made anybody wait for anything.
   */
  await expect(page.getByRole('heading', { name: 'Covered cars' })).toBeVisible();
}
