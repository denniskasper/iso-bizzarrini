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
  await expect(page.getByRole('heading', { name: 'The archive is members-only.' })).toHaveCount(0);
}
