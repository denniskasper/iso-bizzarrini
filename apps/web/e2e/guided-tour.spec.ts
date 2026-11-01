import type { RosterResponse } from '@ricambi/contracts';
import { expect, test } from '@playwright/test';
import { landed, PRACTICE, signIn, signInAs } from './support/gate.js';

/**
 * **The guided tours** (temporary): a tester's walk through what is new on the practice system,
 * Spending from a bare `?tour` link, and the earlier ones from `?tour=proposals` and
 * `?tour=reading`.
 * Delete with `components/tour`. What a browser alone can say: that a link starts it, that it
 * waits for the page and moves on by itself, and that it survives signing out, which is how it
 * reaches the archive as a Visitor sees it.
 */
test('a link starts the tour, and it moves on when the page shows a step was done', async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto('/?tour=reading');

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
  await page.getByRole('button', { name: 'Tour: reading and Visitors' }).click();
  await expect(tour.getByTestId('tour-step')).toHaveText('Three new things to try');
  await expect(page.getByRole('button', { name: 'Tour: reading and Visitors' })).toHaveCount(0);
});

test('signing out moves the tour on to the archive as a Visitor sees it', async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto('/?tour=reading');
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

test('a Tavola 51 that was not loaded can be skipped, on to showing a drawing', async ({
  page,
}) => {
  await signIn(page);
  await page.evaluate(() =>
    window.localStorage.setItem('ricambi.tour', JSON.stringify({ step: 2, folded: false })),
  );
  await page.reload();
  const tour = page.getByTestId('tour');
  await expect(tour.getByTestId('tour-step')).toHaveText('Wait for it to finish');

  await tour.getByRole('button', { name: 'Tavola 51 wasn’t loaded' }).click();
  await expect(tour.getByTestId('tour-step')).toHaveText('Show a drawing to Visitors');
});

test('a link starts the Proposals tour, which keeps clear of the answer being written', async ({
  page,
  browser,
}, info) => {
  // Somebody not let propose is told whom to ask.
  await signInAs(page, PRACTICE.member);
  await landed(page);
  await page.goto('/?tour=proposals');
  const tour = page.getByTestId('tour');
  await expect(tour.getByTestId('tour-step')).toHaveText('Something new: Proposals');
  await expect(tour).toContainText('Ask the developer to let you propose');

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

  await tour.getByRole('button', { name: 'Not now' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await signIn(page);
  await page.goto('/?tour=proposals');
  await expect(tour.getByTestId('tour-step')).toHaveText('Something new: Proposals');
  await expect(tour).not.toContainText('Ask the developer');
  await tour.getByRole('button', { name: 'Start' }).click();
  await expect(tour.getByTestId('tour-step')).toHaveText('Propose a Fix');

  // Proposing, the tour crosses to the other corner where there is room, and steps aside where
  // there is not, rather than cover the answer being written.
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

  // The last part moves on by itself once a Proposal is opened from the list.
  await page.evaluate(() =>
    window.localStorage.setItem(
      'ricambi.tour',
      JSON.stringify({ tour: 'proposals', step: 5, folded: false }),
    ),
  );
  await page.reload();
  await expect(tour.getByTestId('tour-step')).toHaveText('Follow what becomes of them');
  await tour.getByRole('link', { name: 'Go to Proposals' }).click();
  await expect(page).toHaveURL(/\/proposals$/);
  await expect(tour).toContainText('Waiting for you to do this on the page.');

  // The footer offers both tours once this one has ended.
  await tour.getByRole('button', { name: 'End tour' }).click();
  await expect(page.getByRole('button', { name: 'Tour: Proposals' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tour: reading and Visitors' })).toBeVisible();
});

test('a bare link starts the Spending tour, for Administrators, which moves on at Spending', async ({
  page,
}, info) => {
  // Somebody who is not an Administrator is told the tour is not for them.
  await signInAs(page, PRACTICE.member);
  await landed(page);
  await page.goto('/?tour');
  const tour = page.getByTestId('tour');
  await expect(tour.getByTestId('tour-step')).toHaveText('Something new: Spending');
  await expect(tour).toContainText('Spending is for Administrators only');
  await tour.getByRole('button', { name: 'Not now' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);

  await signIn(page);
  await page.goto('/?tour');
  await expect(tour.getByTestId('tour-step')).toHaveText('Something new: Spending');
  await expect(tour).not.toContainText('Administrators only');
  await tour.getByRole('button', { name: 'Start' }).click();

  await expect(tour.getByTestId('tour-step')).toHaveText('Open Spending');
  await tour.getByRole('link', { name: 'Go to Spending' }).click();
  await expect(page).toHaveURL(/\/spending$/);
  await expect(tour.getByTestId('tour-step')).toHaveText('This month, at a glance');
  await page.screenshot({ path: info.outputPath('spending.png') });

  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(tour.getByTestId('tour-step')).toHaveText('Before starting a reading');
  await tour.getByRole('link', { name: 'Go to Readings' }).click();
  await expect(page).toHaveURL(/\/readings$/);
  await tour.getByRole('button', { name: 'I’ve seen it' }).click();

  await expect(tour.getByTestId('tour-step')).toHaveText('When the month runs out');
  await tour.getByRole('button', { name: 'Next' }).click();
  await tour.getByRole('button', { name: 'End the tour' }).click();
  await expect(tour).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tour: Spending' })).toBeVisible();
});
