import { expect, test } from '@playwright/test';
import { signIn } from './support/gate.js';

test.describe('the application shell', () => {
  test('serves the app for a deep link, so a shared address survives a reload', async ({
    page,
  }) => {
    // Nothing lives here, but the *archive* must answer — not the web server.
    const response = await page.goto('/tavola/207');

    expect(response?.status()).toBe(200);
    // Signed out, even an address that does not exist is answered by the gate rather than by a
    // page saying what is not there. A stranger learns nothing about the archive's shape.
    await expect(page.getByRole('heading', { name: 'The archive is members-only.' })).toBeVisible();
  });

  test('says plainly when a signed-in member follows an address that leads nowhere', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/tavola/207');

    await expect(page.getByRole('heading', { name: 'There is nothing here.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to the catalog' })).toBeVisible();
  });

  test.describe('the theme', () => {
    test.use({ colorScheme: 'dark' });

    test('is graphite when nothing says otherwise, so the drawing is the brightest thing on screen', async ({
      page,
    }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveClass(/dark/);
    });

    test('remembers an explicit choice, so nobody re-picks it every visit', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Switch to the light theme' }).click();
      await expect(page.locator('html')).not.toHaveClass(/dark/);

      await page.reload();
      await expect(page.locator('html')).not.toHaveClass(/dark/);
    });
  });

  test.describe('a browser asking for light', () => {
    test.use({ colorScheme: 'light' });

    test('is answered with paper, because a stated preference outranks our default', async ({
      page,
    }) => {
      await page.goto('/');
      await expect(page.locator('html')).not.toHaveClass(/dark/);
    });
  });

  test('gives every control a target a cold or gloved hand can hit', async ({ page }) => {
    await page.goto('/');

    // Links as well as buttons — the rule is about anything you have to hit, not about roles.
    const controls = await page.getByRole('button').or(page.getByRole('link')).all();
    expect(controls.length).toBeGreaterThan(0);

    for (const control of controls) {
      const name = (await control.getAttribute('aria-label')) ?? (await control.innerText());
      const box = await control.boundingBox();
      expect(box, `"${name}" is laid out`).not.toBeNull();
      expect(box!.height, `"${name}" is tall enough`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `"${name}" is wide enough`).toBeGreaterThanOrEqual(44);
    }
  });
});
