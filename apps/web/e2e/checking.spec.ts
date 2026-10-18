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
