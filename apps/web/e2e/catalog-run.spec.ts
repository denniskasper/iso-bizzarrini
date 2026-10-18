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
