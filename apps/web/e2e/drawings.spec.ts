import { expect, test, type Page } from '@playwright/test';
import { PASSPHRASE, signIn } from './support/gate.js';

/**
 * The browser seam, and deliberately thin: everything a request and a response can prove is
 * proved at the API seam instead. What is here is what only a real browser can show —
 * that the drawing actually renders, that a signed-out browser gets told why it cannot see one
 * rather than a broken picture, and that being sent to the gate does not lose where you were
 * going.
 */
async function openGrifo(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('link', { name: 'Iso Grifo' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Grifo');
}

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
    await signIn(page);
    await openGrifo(page);
    await page.getByTestId('tavola-plate').first().click();

    const provenance = page.getByRole('region', { name: 'On the sheet' });
    await expect(provenance).toContainText('Sezione');
    await expect(provenance).toContainText('260');
    await expect(provenance).toContainText('Sottogruppo');
  });

  // The whole archive is behind the gate, not only the images: a stranger does not get to read
  // a Tavola's number, its names or the factory's Sezione either.
  test('shows a signed-out browser nothing of a car at all', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'The archive is members-only.' })).toBeVisible();
    await expect(page.getByTestId('model-row')).toHaveCount(0);
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
    await signIn(page);
    await openGrifo(page);
    await page.getByTestId('tavola-plate').first().click();
    const drawingUrl = new URL(page.url()).pathname;

    // Now arrive at that address the way the member who was sent it does: signed out.
    await page.context().clearCookies();
    await page.goto(drawingUrl);
    await expect(page.getByRole('heading', { name: 'The archive is members-only.' })).toBeVisible();

    await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
    await page.getByLabel('Passphrase').fill(PASSPHRASE);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe(drawingUrl);
    await expect(page.getByRole('img', { name: /Tavola 2/ })).toBeVisible();
  });
});
