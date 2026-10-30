import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './support/gate.js';

/**
 * **Denser type on a desk, today's type in the garage** (issue #108). What a laptop is given is a
 * smaller type step from the breakpoint at which the drawing sits beside its parts; what a phone
 * keeps is every size it had, and what neither loses is a control's height.
 *
 * Both widths in one browser, set explicitly, so the comparison is the step and not two devices.
 */

const PHONE = { width: 390, height: 844 };
const LAPTOP = { width: 1366, height: 768 };

/** The smallest a sentence is allowed to be read at, on any screen. */
const BODY_FLOOR = 14;
/** `--spacing-control`, which no width is allowed to shrink. */
const CONTROL = 44;

test.beforeEach(() => {
  test.skip(
    test.info().project.name !== 'chromium',
    'Each test sets the widths it compares, so one browser is enough.',
  );
});

function fontSize(locator: Locator): Promise<number> {
  return locator.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
}

/** What the start page is set in, read at whatever width the page is at now. */
async function sizesOnTheStartPage(page: Page) {
  const introduction = page.getByText('Choose a car, open the factory drawing');
  const search = page.getByRole('banner').getByRole('link', { name: 'Search', exact: true });
  await expect(introduction).toBeVisible();
  return {
    body: await fontSize(page.locator('body')),
    heading: await fontSize(page.getByRole('heading', { name: 'Covered cars', level: 1 })),
    introduction: await fontSize(introduction),
    chrome: await fontSize(search),
  };
}

async function controlHeights(page: Page) {
  const search = page.getByRole('banner').getByRole('link', { name: 'Search', exact: true });
  const addACar = page.getByRole('button', { name: 'Add a car' });
  return {
    search: (await search.boundingBox())?.height ?? 0,
    addACar: (await addACar.boundingBox())?.height ?? 0,
  };
}

test('a phone keeps the sizes it had, and a laptop reads a step smaller but never under 14px', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await signIn(page);
  const phone = await sizesOnTheStartPage(page);

  // The garage's sizes, exactly as they were before the laptop had a step of its own.
  expect(phone).toEqual({ body: 16, heading: 48, introduction: 18, chrome: 14 });

  await page.setViewportSize(LAPTOP);
  const laptop = await sizesOnTheStartPage(page);

  expect(laptop.body).toBeLessThan(phone.body);
  expect(laptop.introduction).toBeLessThan(phone.introduction);
  for (const size of [laptop.body, laptop.introduction, laptop.chrome]) {
    expect(size).toBeGreaterThanOrEqual(BODY_FLOOR);
  }
});

test('a control is as tall on a laptop as on a phone', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signIn(page);
  const phone = await controlHeights(page);

  await page.setViewportSize(LAPTOP);
  const laptop = await controlHeights(page);

  expect(phone).toEqual({ search: CONTROL, addACar: CONTROL });
  expect(laptop).toEqual(phone);
});

test('a laptop shows every car on the start page without scrolling', async ({ page }) => {
  await page.setViewportSize(LAPTOP);
  await signIn(page);

  const rows = page.getByTestId('model-row');
  await expect(rows).toHaveCount(4);

  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  for (const row of await rows.all()) {
    const box = await row.boundingBox();
    expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(LAPTOP.height);
  }
});

test('beside a drawing on a laptop, the part panel has room for a part', async ({ page }) => {
  await page.setViewportSize(LAPTOP);
  await signIn(page);
  await page.getByRole('link', { name: /5300 GT Strada/ }).click();
  await page.getByTestId('tavola-plate').first().click();
  await expect(page.getByTestId('drawing-stage')).toBeVisible();

  const minimum = await page.evaluate(
    () =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--width-part-panel'),
      ) * parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  expect(minimum).toBeGreaterThan(0);

  const panel = await page.getByTestId('part-panel').boundingBox();
  const stage = await page.getByTestId('drawing-stage').boundingBox();
  expect(panel?.width ?? 0).toBeGreaterThanOrEqual(minimum);
  // Beside the drawing, and not below it.
  expect(panel?.x ?? 0).toBeGreaterThan((stage?.x ?? 0) + (stage?.width ?? 0));
});
