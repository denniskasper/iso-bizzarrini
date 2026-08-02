import { expect, test } from '@playwright/test';

/**
 * This seam runs the built app served by the API with no `ENVIRONMENT_MODE` set — which is a
 * non-production environment, because that is the default and deliberately so. So these tests
 * drive exactly what a practice deployment puts in front of an Editor or a board member.
 *
 * Production's side of it is at the API seam, where the served document can be read directly:
 * there is only one server here, and it is not the real archive.
 */
test.describe('a system that is not the real archive', () => {
  test('says so, on the catalog and on a deep link alike', async ({ page }) => {
    await page.goto('/');

    const banner = page.getByTestId('environment-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/demo/i);
    await expect(banner).toContainText(/practice/i);

    await page.goto('/tavola/207');
    await expect(page.getByTestId('environment-banner')).toBeVisible();
  });

  test('is identifiable from the browser tab alone', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/^DEMO/);
  });

  test('offers no way to be rid of it, and a reload does not clear it', async ({ page }) => {
    await page.goto('/');

    const banner = page.getByTestId('environment-banner');
    await expect(banner.getByRole('button')).toHaveCount(0);
    await expect(banner.getByRole('link')).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('environment-banner')).toBeVisible();
  });

  test('stays on screen when the page is scrolled', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('End');

    await expect(page.getByTestId('environment-banner')).toBeInViewport();
  });

  test("does not wear the Club's chrome, so no screenshot of it can pass for the archive", async ({
    page,
  }) => {
    await page.goto('/');

    const background = await page
      .getByRole('banner')
      .evaluate((element) => getComputedStyle(element).backgroundColor);

    // The tokens are authored in OKLCH and reported back in it, so the hue can be read straight
    // off. Production's chrome is the Club's own — a cool graphite at 264°, or its white paper.
    // Anything in the warm arc is, by construction, not the Club's colour.
    const hue = Number(/^oklch\([^)]*?\s([\d.]+)\)$/.exec(background)?.[1]);
    expect(hue, `the chrome reported ${background}`).toBeGreaterThan(30);
    expect(hue).toBeLessThan(110);
  });
});
