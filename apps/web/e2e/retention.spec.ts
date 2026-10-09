import { expect, test } from '@playwright/test';
import { signIn } from './support/gate.js';

/**
 * Retention and erasure, in a real browser (issue #7, ADR 0007).
 *
 * Thin, like the rest of this seam. What is deleted, what survives and when the sweep acts are
 * all proved at the API seam, with a clock that can be moved; what is here is what only a browser
 * can show — that somebody who is not signed in can read what is kept about them, and that an
 * Administrator can erase a person and is told what stayed behind.
 */
test('the privacy statement can be read by somebody who is not signed in', async ({ page }) => {
  await page.goto('/privacy');

  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  // The figures are the running system's own, so the page and the sweep cannot disagree.
  await expect(page.getByText('kept for 3 years after')).toBeVisible();
  await expect(page.getByText(/until\s+10 years after the end of the year/)).toBeVisible();
  await expect(page.getByText('a former member')).toBeVisible();
});

test('the privacy statement is one press from every screen', async ({ page }) => {
  await page.goto('/sign-in');

  await page.getByRole('link', { name: 'Privacy' }).click();

  await expect(page.getByRole('heading', { name: 'If you ask to be deleted' })).toBeVisible();
});

test.describe('on the roster', () => {
  /**
   * **This test erases somebody of its own**, for the reason the payment test lapses one of its
   * own: the suite shares a database it does not empty, and the seeded members are everybody
   * else's.
   */
  test('an Administrator erases a person and is told what stays', async ({ page }) => {
    await signIn(page);
    await page.goto('/roster');

    const email = `leaving-${Date.now()}@example.invalid`;
    await page.getByRole('button', { name: 'Add somebody' }).click();
    await page.getByLabel('Name').fill('Parte Domani');
    await page.getByLabel('E-mail address').fill(email);
    await page.getByRole('button', { name: 'Add them and send the invitation' }).click();

    const them = page.locator('li').filter({ hasText: email });
    await them.getByRole('button', { name: 'Erase…' }).click();

    // What goes and what stays, said before the button that does it.
    await expect(them.getByText('What they published, word for word')).toBeVisible();
    await them.getByRole('button', { name: 'Erase Parte Domani' }).click();

    await expect(page.getByRole('status')).toContainText('Parte Domani has been erased.');
    await expect(page.getByText(email)).toHaveCount(0);
  });

  test('does not offer an Administrator their own erasure', async ({ page }) => {
    await signIn(page);
    await page.goto('/roster');

    const own = page.locator('li').filter({ hasText: 'ada@example.invalid' });
    await expect(own.getByRole('button', { name: 'Record a payment' })).toBeVisible();
    await expect(own.getByRole('button', { name: 'Erase…' })).toHaveCount(0);
  });

  /**
   * The dry run, where an Administrator will see it: somebody whose Membership ran out longer
   * ago than the retention period is named at the foot of the roster, with the date they were
   * kept until, before the daily sweep reaches them.
   */
  test('names who the next sweep would delete', async ({ page }) => {
    await signIn(page);
    await page.goto('/roster');

    const email = `long-gone-${Date.now()}@example.invalid`;
    await page.getByRole('button', { name: 'Add somebody' }).click();
    await page.getByLabel('Name').fill('Lungo Assente');
    await page.getByLabel('E-mail address').fill(email);
    await page.getByLabel('Paid through').fill('2019-06-30');
    await page.getByRole('button', { name: 'Add them and send the invitation' }).click();

    const due = page.getByTestId('retention-due').locator('li').filter({ hasText: email });
    await expect(due).toContainText('2019-06-30');
    await expect(due).toContainText('2022-06-30');
  });
});
