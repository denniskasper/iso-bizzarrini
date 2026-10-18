import { expect, test } from '@playwright/test';
import { landed, PRACTICE, signIn, signInAs } from './support/gate.js';

/**
 * The Readings section, in a real browser (issue #55). Which method is reported for each
 * configuration, and that nobody else is told, is proved at the API seam. What is here is that an
 * Administrator can find the section and read the method, and an Editor is not offered it.
 *
 * This suite's server reads with the fake method (`playwright.config.ts`).
 */
test('an Administrator sees the Readings section and what it reads with', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Readings' }).click();

  await expect(page.getByRole('heading', { name: 'Readings', level: 1 })).toBeVisible();
  await expect(page.getByTestId('reading-method')).toHaveText('Practice method, not charged');
  await expect(page.getByTestId('reading-available')).toBeVisible();
});

test('an Editor is not offered it', async ({ page }) => {
  await signInAs(page, PRACTICE.editor);
  await landed(page);

  await expect(page.getByRole('link', { name: 'Readings' })).toHaveCount(0);

  await page.goto('/readings');
  await expect(page.getByRole('heading', { name: /is the Club's to keep/ })).toBeVisible();
  await expect(page.getByTestId('reading-method')).toHaveCount(0);
});
