import { expect, test } from '@playwright/test';
import { fixturePdf } from './support/catalog-pdf.js';
import { signIn } from './support/gate.js';

/**
 * **A catalog's pages, counted the moment it is chosen** (issue #69). Nothing is uploaded here:
 * the count is the browser's own, and a range past it cannot be estimated. The server's own
 * refusal of such a range is proved at the API seam.
 */
test('choosing a catalog shows how many pages it has, and a range past them cannot be estimated', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Readings' }).click();

  await page.getByTestId('catalog-file').setInputFiles({
    name: 'catalog.pdf',
    mimeType: 'application/pdf',
    buffer: fixturePdf(5),
  });
  const chosen = page.getByTestId('catalog-chosen');
  await expect(chosen).toContainText('catalog.pdf');
  await expect(chosen).toContainText('5 pages');
  await expect(page.getByTestId('catalog-counting')).toHaveCount(0);

  await page.getByLabel('Model').selectOption({ index: 1 });
  await page.getByLabel('From page').fill('2');
  await page.getByLabel('To page').fill('6');
  await expect(
    page.getByText('The catalog has 5 pages, so there is no page after 5'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Estimate the cost' })).toBeDisabled();

  await page.getByLabel('To page').fill('5');
  await expect(page.getByText('The catalog has 5 pages')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Estimate the cost' })).toBeEnabled();
});

test('a file that is not a PDF that can be read is refused when it is chosen', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Readings' }).click();

  await page.getByTestId('catalog-file').setInputFiles({
    name: 'scan.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('not a PDF at all'),
  });

  await expect(
    page.getByText('scan.pdf cannot be read. It is not a PDF that can be read.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Estimate the cost' })).toBeDisabled();
});

test('a page is a whole number, and nothing else can be typed for one', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Readings' }).click();

  await page.getByTestId('catalog-file').setInputFiles({
    name: 'catalog.pdf',
    mimeType: 'application/pdf',
    buffer: fixturePdf(5),
  });
  await expect(page.getByTestId('catalog-chosen')).toContainText('5 pages');

  const from = page.getByLabel('From page');
  await from.fill('4.4');
  await expect(from).toHaveValue('');
  await from.pressSequentially('4.4');
  await expect(from).toHaveValue('44');
  await from.fill('0');
  await expect(page.getByText('The catalog has 5 pages, counted from 1.')).toBeVisible();
  await from.fill('3');
  await expect(from).toHaveValue('3');
  await expect(page.getByText('The catalog has 5 pages')).toHaveCount(0);
});
