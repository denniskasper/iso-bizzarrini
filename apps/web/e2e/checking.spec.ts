import { expect, test } from '@playwright/test';
import { signIn } from './support/gate.js';

/**
 * **Checking a Tavola without Excel** (issue #56): a doubt an Editor has looked at is cleared on
 * the checking screen, and the band then holds only what still needs looking at.
 *
 * The practice archive leaves one drawing Unchecked, with a doubt at each of several numbers. Both
 * screens run against that one archive at once, so each clears the doubt at a number of its own.
 */
const CLEARED_BY: Record<string, string> = { chromium: '1', mobile: '3' };

test('an Editor clears a doubt they have looked at, and it is no longer there', async ({
  page,
}) => {
  const number = CLEARED_BY[test.info().project.name] ?? '1';
  await signIn(page);
  await page.getByRole('link', { name: /5300 GT Strada/ }).click();

  // What is left to check on the car, and the way to it.
  const left = page.getByTestId('left-to-check');
  await expect(left).toContainText('Fuel pump');
  await left.getByRole('link', { name: /Fuel pump/ }).click();
  await expect(page.getByTestId('unchecked-band')).toBeVisible();

  const doubts = page.getByTestId('reading-doubt');
  const doubt = doubts.filter({ has: page.getByText(number, { exact: true }) });
  await expect(doubt).toHaveCount(1);

  await doubt.getByRole('button', { name: 'Clear' }).click();

  await expect(doubt).toHaveCount(0);
  await expect(doubts.filter({ hasText: 'no row of the table lists it' })).toHaveCount(1);
  // Publishing is still there to press, with doubts left or none.
  await expect(page.getByRole('button', { name: 'Publish' })).toBeEnabled();
});

test('following a doubt keeps the page where it was', async ({ page }) => {
  // Short enough that the doubts sit below the fold on either screen.
  const { width } = page.viewportSize() ?? { width: 1280 };
  await page.setViewportSize({ width, height: 480 });
  await signIn(page);
  await page.getByRole('link', { name: /5300 GT Strada/ }).click();
  await page
    .getByTestId('left-to-check')
    .getByRole('link', { name: /Fuel pump/ })
    .click();

  // Neither screen clears this one, so it is there for both.
  const doubt = page
    .getByTestId('reading-doubt')
    .filter({ has: page.getByText('4', { exact: true }) });
  await doubt.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);

  await doubt.getByRole('button', { name: /no row of the table lists it/ }).click();

  // It used to be thrown back to the top of the page, a few pixels from 0.
  await expect(page).toHaveURL(/position=4/);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(before);
});

test('the Unchecked band says how to check a Tavola, when asked', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: /5300 GT Strada/ }).click();
  await page
    .getByTestId('left-to-check')
    .getByRole('link', { name: /Fuel pump/ })
    .click();

  const guide = page.getByTestId('checking-guide');
  await expect(guide.getByText('Go through the doubts.')).toBeHidden();
  await guide.getByText('How to check this Tavola').click();
  await expect(guide.getByText('Go through the doubts.')).toBeVisible();
  await expect(guide).toContainText('Record a part here');
});
