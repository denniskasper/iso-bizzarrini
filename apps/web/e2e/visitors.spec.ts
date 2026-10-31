import { expect, test } from '@playwright/test';
import { landed, MEMBER_PASSWORD, PRACTICE } from './support/gate.js';

/**
 * **What a Visitor is shown** (issue #128): what Ricambi is, the cars it covers and how deep it
 * goes for each, what membership gives, and the fee. Which Models are listed and what is counted
 * is proved at the API seam; what is here is that a browser shows it, and that the members who
 * arrive signed out still find the way in.
 */
test.describe('the landing a Visitor arrives at', () => {
  test('says what Ricambi is, the cars it covers, what membership gives and its fee', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Ricambi' })).toBeVisible();
    await expect(page.getByText('parts archive for Iso and Bizzarrini cars')).toBeVisible();

    const grifo = page.getByTestId('visitor-model-row').filter({ hasText: 'Grifo' });
    await expect(grifo).toContainText(/\d+\s*drawings?/);

    await expect(page.getByRole('heading', { name: 'How a member finds a part' })).toBeVisible();
    await expect(page.getByRole('img', { name: /drawing/ }).first()).toBeVisible();
    await expect(page.getByTestId('landing-fee')).toContainText(/a year/);
  });

  test('keeps signing in one press away, for the members who arrive signed out', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
    await page.getByLabel('E-mail address').fill(PRACTICE.member);
    await page.getByLabel('Password').fill(MEMBER_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await landed(page);
  });
});
