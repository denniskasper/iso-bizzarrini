import { expect, test } from '@playwright/test';
import { openFirstDrawing } from './support/archive.js';

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
    await expect(banner).toContainText(/integration/i);
    await expect(banner).toContainText(/practice system/i);

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

  test('marks the drawing in full screen too, where the band is out of sight', async ({ page }) => {
    await openFirstDrawing(page);
    await expect(page.getByTestId('environment-mark')).toHaveCount(0);

    await page.getByRole('button', { name: 'Full screen' }).click();

    const mark = page.getByTestId('environment-mark');
    await expect(mark).toBeInViewport();
    await expect(mark).toContainText(/integration/i);
    await expect(mark.getByRole('button')).toHaveCount(0);

    await page.getByRole('button', { name: 'Leave full screen' }).click();
    await expect(page.getByTestId('environment-mark')).toHaveCount(0);
  });

  test('tells Development apart from Integration, in words and in colour', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByTestId('environment-banner');
    const integration = await banner.evaluate((band) => getComputedStyle(band).backgroundColor);

    // Only `vite dev` marks a page Development, and this seam serves the built app: the page is
    // marked here as Vite would have marked it.
    await page.route('**/*', async (route) => {
      if (route.request().resourceType() !== 'document') {
        return route.continue();
      }
      const response = await route.fetch();
      const html = (await response.text()).replace(
        /<html\b([^>]*)>/i,
        '<html$1 data-environment-system="development">',
      );
      return route.fulfill({ response, body: html });
    });
    await page.goto('/');

    await expect(banner).toContainText(/development/i);
    await expect(banner).toContainText(/your own machine/i);
    await expect(banner).not.toContainText(/integration/i);
    expect(await banner.evaluate((band) => getComputedStyle(band).backgroundColor)).not.toBe(
      integration,
    );
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`in the ${colorScheme} theme`, () => {
      test.use({ colorScheme });

      test("wears production's surfaces and rules, so the band alone says what it is", async ({
        page,
      }) => {
        await page.goto('/');
        await expect(page.locator('html')).toHaveAttribute(
          'data-environment-mode',
          'non-production',
        );

        // There is only one server at this seam, so production is read off the same page with
        // the stamp the API would have written in its place.
        const surfaces = await page.evaluate(() => {
          const tokens = [
            '--surface',
            '--surface-raised',
            '--surface-sunken',
            '--line',
            '--line-strong',
          ];
          const root = document.documentElement;
          const read = () => {
            const style = getComputedStyle(root);
            return tokens.map((token) => `${token}: ${style.getPropertyValue(token).trim()}`);
          };
          const practice = read();
          root.dataset.environmentMode = 'production';
          const production = read();
          root.dataset.environmentMode = 'non-production';
          return { practice, production };
        });

        expect(surfaces.practice).toEqual(surfaces.production);
      });
    });
  }
});
