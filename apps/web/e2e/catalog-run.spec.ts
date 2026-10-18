import { expect, test } from '@playwright/test';
import { fixturePdf } from './support/catalog-pdf.js';
import { signIn } from './support/gate.js';

/**
 * Beginning a Catalog run, in a real browser (issue #57): the catalog uploaded, a Model and the
 * pages chosen, and the estimate shown. Who may do it, and the figures themselves, are proved at
 * the API seam.
 *
 * This suite's server reads with the fake method, which counts every request at a cent, so a
 * page is estimated at four: asked what it is, read twice and translated.
 */
test('an Administrator uploads a catalog and sees what reading it would cost', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Readings' }).click();
  await expect(page.getByRole('heading', { name: 'Read a catalog' })).toBeVisible();

  await page.getByTestId('catalog-file').setInputFiles({
    name: 'catalog.pdf',
    mimeType: 'application/pdf',
    buffer: fixturePdf(5),
  });
  const grifo = await page.locator('option', { hasText: 'Grifo' }).first().getAttribute('value');
  await page.getByLabel('Model').selectOption(grifo ?? '');
  await page.getByLabel('From page').fill('2');
  await page.getByLabel('To page').fill('4');
  await page.getByRole('button', { name: 'Estimate the cost' }).click();

  const estimate = page.getByTestId('catalog-estimate');
  await expect(estimate).toContainText('$0.12');
  await expect(estimate).toContainText('It is not charged.');
  await expect(estimate).toContainText('3 pages, 2 to 4 of 5');
});

/**
 * **Starting a run and watching it finish** (issue #58). The practice server's fake method reads
 * every page as a Table sheet of a Tavola of its own, numbered 100 past the page, so pages 2 to 4
 * become Tavole 102 to 104, each Unchecked.
 *
 * One project only: both share one server, and it reads one Catalog run at a time.
 */
test('an Administrator starts a run, watches it finish and opens a Tavola it read', async ({
  page,
}) => {
  test.skip(test.info().project.name !== 'chromium', 'One Catalog run at a time, on one server.');
  await signIn(page);
  await page.getByRole('link', { name: 'Readings' }).click();

  await page.getByTestId('catalog-file').setInputFiles({
    name: 'catalog.pdf',
    mimeType: 'application/pdf',
    buffer: fixturePdf(5),
  });
  const grifo = await page.locator('option', { hasText: 'Grifo' }).first().getAttribute('value');
  await page.getByLabel('Model').selectOption(grifo ?? '');
  await page.getByLabel('From page').fill('2');
  await page.getByLabel('To page').fill('4');
  await page.getByRole('button', { name: 'Estimate the cost' }).click();
  await expect(page.getByTestId('catalog-estimate')).toBeVisible();

  await page.getByLabel('Spending limit, in dollars').fill('1');
  await page.getByRole('button', { name: 'Start reading' }).click();

  await expect(page.getByTestId('catalog-run-state')).toContainText('Finished', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('run-spent')).toContainText('$0.');
  await expect(page.getByTestId('run-tavola')).toHaveCount(3);

  await page
    .getByTestId('run-tavola')
    .filter({ hasText: 'Tavola 102' })
    .getByRole('link', { name: 'Open, Unchecked' })
    .click();
  await expect(page.getByTestId('unchecked-band')).toBeVisible();
});
