import { expect, test } from '@playwright/test';
import { signIn } from './support/gate.js';

/**
 * **The guided tour** (temporary): a tester's walk through what is new on the practice system.
 * Delete with `components/tour`. What a browser alone can say: that a link starts it, that it
 * waits for the page and moves on by itself, and that it survives signing out, which is how it
 * reaches the archive as a Visitor sees it.
 */
test('a link starts the tour, and it moves on when the page shows a step was done', async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto('/?tour');

  const tour = page.getByTestId('tour');
  await expect(tour.getByTestId('tour-step')).toHaveText('Three new things to try');
  // Started once, then forgotten, so reloading does not start it over.
  await expect(page).not.toHaveURL(/tour/);
  await page.screenshot({ path: info.outputPath('welcome.png') });

  await tour.getByRole('button', { name: 'Start' }).click();
  await expect(tour.getByTestId('tour-step')).toHaveText('Start a reading');
  await tour.getByRole('link', { name: 'Go to Readings' }).click();
  await expect(page).toHaveURL(/\/readings$/);
  await expect(tour).toContainText('Waiting for you to do this on the page.');

  await page.reload();
  await expect(tour.getByTestId('tour-step')).toHaveText('Start a reading');

  await tour.getByRole('button', { name: 'Fold' }).click();
  await expect(tour.getByTestId('tour-step')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('folded.png') });
  await tour.getByRole('button', { name: /Start a reading/ }).click();

  await tour.getByRole('button', { name: 'Start over' }).click();
  await expect(tour.getByTestId('tour-step')).toHaveText('Three new things to try');
  await tour.getByRole('button', { name: 'Start' }).click();

  await tour.getByRole('button', { name: 'End tour' }).click();
  await expect(tour).toHaveCount(0);

  // Ended, it can be taken again from the footer, from the beginning.
  await page.getByRole('button', { name: 'Take the tour' }).click();
  await expect(tour.getByTestId('tour-step')).toHaveText('Three new things to try');
  await expect(page.getByRole('button', { name: 'Take the tour' })).toHaveCount(0);
});

test('signing out moves the tour on to the archive as a Visitor sees it', async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto('/?tour');
  const tour = page.getByTestId('tour');
  await tour.getByRole('button', { name: 'Start' }).click();

  // Through the steps nothing on the page can tell were done, as the tester would say they were.
  await page.goto('/');
  await expect(tour.getByTestId('tour-step')).toHaveText('Start a reading');
  await page.evaluate(() =>
    window.localStorage.setItem('ricambi.tour', JSON.stringify({ step: 5, folded: false })),
  );
  await page.reload();
  await expect(tour.getByTestId('tour-step')).toHaveText('Sign out');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(tour.getByTestId('tour-step')).toHaveText('What a Visitor sees');
  await page.screenshot({ path: info.outputPath('visitor.png'), fullPage: false });
});
