import { expect, test } from '@playwright/test';
import { openFirstDrawing, openGrifo } from './support/archive.js';
import { MEMBER_PASSWORD, PRACTICE, signIn } from './support/gate.js';

/**
 * The browser seam, and deliberately thin: everything a request and a response can prove is
 * proved at the API seam instead. What is here is what only a real browser can show —
 * that the drawing actually renders, that a signed-out browser gets told why it cannot see one
 * rather than a broken picture, and that being sent to the gate does not lose where you were
 * going. Reading the drawing itself is `viewer.spec.ts`.
 */
test.describe('opening a drawing', () => {
  test('a signed-in member sees the scan itself, drawn on the page', async ({ page }) => {
    await signIn(page);
    await openGrifo(page);

    const plates = page.getByTestId('tavola-plate');
    await expect(plates).toHaveCount(3);

    await plates.first().click();

    const drawing = page.getByRole('img', { name: /Tavola 2/ });
    await expect(drawing).toBeVisible();

    // Rendered, not merely requested: a 404 image is "visible" too.
    await expect
      .poll(() => drawing.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
  });

  test('shows the factory’s own header beside the drawing, as printed', async ({ page }) => {
    await openFirstDrawing(page);

    const provenance = page.getByRole('region', { name: 'On the sheet' });
    await expect(provenance).toContainText('Sezione');
    await expect(provenance).toContainText('260');
    await expect(provenance).toContainText('Sottogruppo');
  });

  // The whole archive is behind the gate, not only the images: a stranger does not get to read
  // a Tavola's number, its names or the factory's Sezione either. What a Visitor is shown is which
  // cars are covered and how many drawings each has (ADR 0019), and nothing to open.
  test('shows a signed-out browser nothing beyond the Samples and the Model counts', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'The archive is members-only.' })).toBeVisible();
    await expect(page.getByTestId('visitor-model-row').first()).toBeVisible();
    await expect(page.getByTestId('model-row')).toHaveCount(0);
    await expect(page.getByTestId('tavola-plate')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Iso Grifo' })).toHaveCount(0);
    await expect(page.getByText('Impianto frenante anteriore')).toHaveCount(0);
  });

  test('a Tavola nobody has scanned says so, and is not mistaken for one that is hidden', async ({
    page,
  }) => {
    await signIn(page);
    await openGrifo(page);

    await expect(
      page.getByTestId('tavola-plate').filter({ hasText: 'Not scanned yet' }),
    ).toHaveCount(1);
  });
});

test.describe('a link into the archive', () => {
  // Story 53. A member sends another member a link to a drawing; opening it signed out must
  // not cost them the thing they were sent.
  test('survives the sign-in screen and lands where it was pointing', async ({ page }) => {
    await openFirstDrawing(page);
    // **A Position and not merely a drawing.** What one member sends another is the number they
    // are looking at (story 52), so what has to survive the gate is the whole address — the
    // search as well as the path, which is a thing the router's own encoding can quietly break.
    await page.locator('[data-testid="sheet-line"][data-position="3"]').click();
    await expect(page.getByTestId('selected-position')).toHaveText('3');

    const sent = new URL(page.url());
    const address = `${sent.pathname}${sent.search}`;

    // Now arrive at that address the way the member who was sent it does: signed out.
    await page.context().clearCookies();
    await page.goto(address);
    await expect(page.getByRole('heading', { name: 'The archive is members-only.' })).toBeVisible();

    await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
    await page.getByLabel('E-mail address').fill(PRACTICE.administrator);
    await page.getByLabel('Password').fill(MEMBER_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect
      .poll(() => {
        const at = new URL(page.url());
        return `${at.pathname}${at.search}`;
      })
      .toBe(address);
    await expect(page.getByRole('img', { name: /Tavola 2/ })).toBeVisible();
    await expect(page.getByTestId('selected-position')).toHaveText('3');
  });
});

test('beside its parts, the drawing stays in view below the chrome as the page scrolls', async ({
  page,
}) => {
  test.skip(
    test.info().project.name !== 'chromium',
    'Only a wide screen puts the parts beside it.',
  );
  await page.setViewportSize({ width: 1440, height: 800 });
  await signIn(page);
  await page.getByRole('link', { name: /5300 GT Strada/ }).click();
  await page
    .getByTestId('left-to-check')
    .getByRole('link', { name: /Fuel pump/ })
    .click();
  const stage = page.getByTestId('drawing-stage');
  await expect(stage).toBeVisible();

  await page.evaluate(() => window.scrollBy(0, 700));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  const chrome = await page
    .locator('[data-chrome]')
    .evaluate((element) => element.getBoundingClientRect().bottom);
  const box = await stage.boundingBox();
  expect(box?.y).toBeGreaterThanOrEqual(chrome);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(800);
});
