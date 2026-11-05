import type { RosterResponse } from '@ricambi/contracts';
import { expect, test, type Page } from '@playwright/test';
import { PRACTICE, signIn } from './support/gate.js';

/**
 * **The guided tour's panel** (temporary), walked with `tours/example.tsx`, a tour that exists for
 * this test: the real tours are content for testers on a practice system, checked by walking them
 * there, so rewording or retiring one never touches this file.
 */
async function startTheExample(page: Page) {
  await page.goto('/?tour=example');
  const tour = page.getByTestId('tour');
  await expect(tour.getByTestId('tour-step')).toHaveText('An example tour');
  return tour;
}

test('a link starts a tour, which waits for the page, folds, starts over and ends', async ({
  page,
}) => {
  await signIn(page);
  const tour = await startTheExample(page);
  // Started once, then forgotten, so reloading does not start it over.
  await expect(page).not.toHaveURL(/tour/);
  // The example is not one anybody is offered.
  await expect(page.getByRole('button', { name: /example/i })).toHaveCount(0);

  await tour.getByRole('button', { name: 'Start' }).click();
  await expect(tour.getByTestId('tour-step')).toHaveText('Open the privacy page');
  await expect(tour).toContainText('Go to Privacy');
  await page.reload();
  await expect(tour.getByTestId('tour-step')).toHaveText('Open the privacy page');

  // It moves on by itself once the page shows the step was done.
  await tour.getByRole('link', { name: 'Go to Privacy' }).click();
  await expect(tour.getByTestId('tour-step')).toHaveText('Sign out');
  await expect(tour).toContainText('Waiting for you to do this on the page.');

  await tour.getByRole('button', { name: 'Fold' }).click();
  await expect(tour.getByTestId('tour-step')).toHaveCount(0);
  await tour.getByRole('button', { name: /Sign out/ }).click();
  await expect(tour.getByTestId('tour-step')).toHaveText('Sign out');

  await tour.getByRole('button', { name: 'Start over' }).click();
  await expect(tour.getByTestId('tour-step')).toHaveText('An example tour');
  await tour.getByRole('button', { name: 'Start' }).click();
  await tour.getByRole('button', { name: 'End tour' }).click();
  await expect(tour).toHaveCount(0);

  // Ended, the footer offers the tours again; none while one is running.
  const offered = page.getByRole('button', { name: /^Tour: / });
  await expect(offered.first()).toBeVisible();
  await offered.first().click();
  await expect(tour).toBeVisible();
  await expect(page.getByRole('button', { name: /^Tour: / })).toHaveCount(0);
});

test('a bare link starts the newest tour', async ({ page }) => {
  await signIn(page);
  await page.goto('/?tour');
  await expect(page.getByTestId('tour').getByTestId('tour-step')).toBeVisible();
  await expect(page).not.toHaveURL(/tour/);
});

test('the tour carries on through signing out, and can skip a part', async ({ page }) => {
  await signIn(page);
  const tour = await startTheExample(page);
  await tour.getByRole('button', { name: 'Start' }).click();

  await tour.getByRole('button', { name: 'Skip to leaving' }).click();
  await expect(tour.getByTestId('tour-step')).toHaveText('Sign out');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(tour.getByTestId('tour-step')).toHaveText('The end');
  await tour.getByRole('button', { name: 'End the tour' }).click();
  await expect(tour).toHaveCount(0);
});

test('a tour since retired is forgotten, and the others offered', async ({ page }) => {
  await signIn(page);
  await page.evaluate(() =>
    window.localStorage.setItem(
      'ricambi.tour',
      JSON.stringify({ tour: 'retired', step: 1, folded: false }),
    ),
  );
  await page.reload();
  await expect(page.getByRole('button', { name: /^Tour: / }).first()).toBeVisible();
  await expect(page.getByTestId('tour')).toHaveCount(0);
});

test('the tour keeps clear of a Proposal being written', async ({ page, browser }, info) => {
  // The Administrator lets themselves propose, as the developer would let the tester.
  const context = await browser.newContext();
  const administrator = await context.newPage();
  await signIn(administrator);
  const roster = (await (await administrator.request.get('/api/roster')).json()) as RosterResponse;
  const ada = roster.members.find((entry) => entry.email === PRACTICE.administrator);
  const granted = await administrator.request.patch(`/api/roster/${ada?.id}`, {
    data: { mayPropose: true },
  });
  expect(granted.ok()).toBe(true);
  await context.close();

  await signIn(page);
  const tour = await startTheExample(page);

  // It crosses to the other corner where there is room, and steps aside where there is not,
  // rather than cover the answer being written.
  await page.getByTestId('propose').click();
  const panel = page.getByTestId('proposal-panel');
  await expect(panel).toBeVisible();
  const width = page.viewportSize()?.width ?? 0;
  if (width >= 1024) {
    await expect(tour).toBeVisible();
    const [tourBox, panelBox] = await Promise.all([tour.boundingBox(), panel.boundingBox()]);
    expect((tourBox?.x ?? 0) + (tourBox?.width ?? 0)).toBeLessThanOrEqual(panelBox?.x ?? 0);
  } else {
    await expect(tour).toBeHidden();
  }
  await page.screenshot({ path: info.outputPath('proposing.png') });
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(tour).toBeVisible();
});
