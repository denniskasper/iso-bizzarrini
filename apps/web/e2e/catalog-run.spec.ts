import { expect, test } from '@playwright/test';
import { fixturePdf } from './support/catalog-pdf.js';
import { signIn } from './support/gate.js';

/**
 * **One run at a time, into a car nobody else counts.** The archive reads one Catalog run at a
 * time, so these run one after another, on the desktop project only, and every one reads into the
 * Fidia, which the practice archive keeps empty for it: the specs that count Grifo's sheets never
 * see a Tavola read here.
 */
test.describe.configure({ mode: 'serial' });
test.beforeEach(() => {
  // Both projects share one server, and a run started by one would hold the other's back.
  test.skip(test.info().project.name !== 'chromium', 'One Catalog run at a time, on one server.');
});
const READ_INTO = 'Iso Fidia';

/**
 * Beginning a Catalog run, in a real browser (issue #57): the catalog uploaded, a Model and the
 * pages chosen, the estimate worked out on the server (issue #65), and then shown. Who may do it, and the figures themselves, are proved at
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
  await page.getByLabel('Model').selectOption({ label: READ_INTO });
  await page.getByLabel('From page').fill('2');
  await page.getByLabel('To page').fill('4');

  // The upload is answered once the catalog is stored, and the pages are priced after it (issue
  // #65). The fake method prices five blank pages quicker than anybody could look, so the run is
  // held as the upload answered it until the estimating state has been seen.
  const estimating = page.getByTestId('catalog-estimating');
  let seen = false;
  await page.route(/\/api\/catalog-runs\/[0-9a-f-]{36}$/, async (route) => {
    if (!seen) {
      await expect(estimating).toContainText('pages priced');
      seen = true;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Estimate the cost' }).click();
  await expect(estimating).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start reading' })).toHaveCount(0);

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
  await signIn(page);
  await page.getByRole('link', { name: 'Readings' }).click();

  await page.getByTestId('catalog-file').setInputFiles({
    name: 'catalog.pdf',
    mimeType: 'application/pdf',
    buffer: fixturePdf(5),
  });
  await page.getByLabel('Model').selectOption({ label: READ_INTO });
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

/**
 * **A run stopped at its limit, raised and continued** (issue #59). The fake method's requests
 * cost a cent and could cost at most 2.6 cents, so a limit of $0.12 for pages 2 to 4 reads Tavola
 * 102 and stops before 103. Raised to a dollar, the run reads 103 and 104 and finishes.
 */
test('an Administrator raises the limit of a stopped run and continues it to the end', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Readings' }).click();

  await page.getByTestId('catalog-file').setInputFiles({
    name: 'catalog.pdf',
    mimeType: 'application/pdf',
    buffer: fixturePdf(5),
  });
  await page.getByLabel('Model').selectOption({ label: READ_INTO });
  await page.getByLabel('From page').fill('2');
  await page.getByLabel('To page').fill('4');
  await page.getByRole('button', { name: 'Estimate the cost' }).click();
  await expect(page.getByTestId('catalog-estimate')).toBeVisible();

  await page.getByLabel('Spending limit, in dollars').fill('0.12');
  await page.getByRole('button', { name: 'Start reading' }).click();

  await expect(page.getByTestId('catalog-run-state')).toContainText('Stopped', {
    timeout: 30_000,
  });
  await expect(
    page.getByTestId('run-tavola').filter({ hasText: 'Tavola 102' }).getByRole('link'),
  ).toBeVisible();

  await page.getByLabel('New spending limit, in dollars').fill('1');
  await page.getByRole('button', { name: 'Raise the limit and continue' }).click();

  await expect(page.getByTestId('catalog-run-state')).toContainText('Finished', {
    timeout: 30_000,
  });
  await expect(page.getByRole('link', { name: 'Open, Unchecked' })).toHaveCount(3);
  await expect(page.getByTestId('run-actions')).toContainText('Limit raised to $1.00');
});

/**
 * **A page set aside, shown rather than guessed** (issue #60). The practice server's fake method
 * cannot read page 5's Tavola number, so a run over pages 4 and 5 reads Tavola 104 and sets page 5
 * aside, with its image for the Administrator to open.
 */
test('an Administrator sees a page a run set aside, and opens it', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Readings' }).click();

  await page.getByTestId('catalog-file').setInputFiles({
    name: 'catalog.pdf',
    mimeType: 'application/pdf',
    buffer: fixturePdf(5),
  });
  await page.getByLabel('Model').selectOption({ label: READ_INTO });
  await page.getByLabel('From page').fill('4');
  await page.getByLabel('To page').fill('5');
  await page.getByRole('button', { name: 'Estimate the cost' }).click();
  await expect(page.getByTestId('catalog-estimate')).toBeVisible();

  await page.getByLabel('Spending limit, in dollars').fill('1');
  await page.getByRole('button', { name: 'Start reading' }).click();

  await expect(page.getByTestId('catalog-run-state')).toContainText('Finished', {
    timeout: 30_000,
  });
  const setAside = page.getByTestId('run-set-aside-page');
  await expect(setAside).toHaveCount(1);
  await expect(setAside).toContainText('Page 5');
  await expect(setAside).toContainText('Its Tavola number could not be read.');

  const opened = page.waitForEvent('popup');
  await setAside.getByRole('link', { name: 'Open the page' }).click();
  const image = await opened;
  const response = await page.request.get(image.url());
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/png');
});

/**
 * **One Unchecked Tavola read again** (issue #61). A run over page 3 reads Tavola 103. Read again
 * from its own page, only that page is read, and the Tavola is replaced whole: it opens at a new
 * address, Unchecked, and the old one is gone.
 */
test('an Administrator reads an Unchecked Tavola again and sees it replaced', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Readings' }).click();

  await page.getByTestId('catalog-file').setInputFiles({
    name: 'catalog.pdf',
    mimeType: 'application/pdf',
    buffer: fixturePdf(5),
  });
  await page.getByLabel('Model').selectOption({ label: READ_INTO });
  await page.getByLabel('From page').fill('3');
  await page.getByLabel('To page').fill('3');
  await page.getByRole('button', { name: 'Estimate the cost' }).click();
  await expect(page.getByTestId('catalog-estimate')).toBeVisible();
  await page.getByLabel('Spending limit, in dollars').fill('1');
  await page.getByRole('button', { name: 'Start reading' }).click();
  await expect(page.getByTestId('catalog-run-state')).toContainText('Finished', {
    timeout: 30_000,
  });

  await page.getByRole('link', { name: 'Open, Unchecked' }).click();
  await expect(page.getByTestId('unchecked-band')).toBeVisible();
  const before = page.url();

  await page.getByTestId('read-again').getByRole('button', { name: 'Read again' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tavola 103');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('read again');
  await expect(page.getByText('Only its page of the catalog, page 3.')).toBeVisible();

  await page.getByLabel('Spending limit, in dollars').fill('1');
  await page.getByRole('button', { name: 'Start reading' }).click();
  await expect(page.getByTestId('catalog-run-state')).toContainText('Finished', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('run-tavola')).toHaveCount(1);

  await page.getByRole('link', { name: 'Open, Unchecked' }).click();
  await expect(page.getByTestId('unchecked-band')).toBeVisible();
  expect(page.url()).not.toBe(before);
  await page.goto(before);
  await expect(page.getByTestId('unchecked-band')).toHaveCount(0);
});

/**
 * **The record of a finished run, opened from the list of past runs** (issue #62). The latest run
 * is listed first, so the one just read is the first line. Its figures are proved at the API seam.
 */
test('an Administrator opens a finished run’s record from the list of past runs', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Readings' }).click();

  await page.getByTestId('catalog-file').setInputFiles({
    name: 'catalog.pdf',
    mimeType: 'application/pdf',
    buffer: fixturePdf(5),
  });
  await page.getByLabel('Model').selectOption({ label: READ_INTO });
  await page.getByLabel('From page').fill('2');
  await page.getByLabel('To page').fill('2');
  await page.getByRole('button', { name: 'Estimate the cost' }).click();
  await page.getByLabel('Spending limit, in dollars').fill('1');
  await page.getByRole('button', { name: 'Start reading' }).click();
  await expect(page.getByTestId('catalog-run-state')).toContainText('Finished', {
    timeout: 30_000,
  });

  await page.getByRole('link', { name: 'Readings' }).first().click();
  const latest = page.getByTestId('past-run').first();
  await expect(latest).toContainText('Fidia');
  await expect(latest).toContainText('finished');
  await expect(latest).toContainText('not charged');
  await latest.click();

  const record = page.getByTestId('run-costs');
  await expect(record).toBeVisible();
  await expect(record).toContainText('not charged');
  await expect(record).toContainText('Tavola 102');
  await expect(record.getByTestId('run-cost-sheet')).toContainText('Page 2, Table sheet');
});
