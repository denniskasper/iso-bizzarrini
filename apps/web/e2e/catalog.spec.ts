import { expect, test } from '@playwright/test';
import { signIn } from './support/gate.js';

test.describe('the archive in a browser', () => {
  test('shows the covered cars, read from the database through the built app', async ({ page }) => {
    await signIn(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Covered cars', level: 1 })).toBeVisible();

    const rows = page.getByTestId('model-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('5300 GT Strada');

    // Grouped by brand, so a member finds their car without reading the whole list.
    await expect(page.getByRole('heading', { name: 'Bizzarrini', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Iso', level: 2 })).toBeVisible();
  });

  // The footer answers even to somebody who cannot get in: a member who cannot sign in because
  // the database is down should be able to see that the database is down.
  test('reports that it reached the API and the API reached the database', async ({ page }) => {
    await page.goto('/');

    const status = page.getByTestId('service-status');
    await expect(status).toContainText('end-to-end');
    await expect(status).toContainText('reachable');
  });
});
