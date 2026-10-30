import { expect, test } from '@playwright/test';
import { landed, PRACTICE, signIn, signInAs } from './support/gate.js';

/**
 * The Units and the Specification names in a real browser (issue #109).
 *
 * Thin: sameness, ordering and who may change what are proved at the API seam. What is here is
 * that the screen is reachable next to the Categories, that an Administrator can keep both lists
 * from it, and that a member reads them without being offered a change.
 *
 * Both projects run against one archive, so every entry a test adds carries the project's name,
 * and nothing here depends on where on the shared list an entry lands.
 */
test.describe('the Specification lists', () => {
  test('are read by a member, with nothing offered to change', async ({ page }) => {
    await signInAs(page, PRACTICE.member);
    await landed(page);

    await page.getByTestId('categories-from-the-catalog').click();
    await page.getByTestId('specifications-from-categories').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Specifications' })).toBeVisible();

    // The starting lists every archive is made with.
    const weight = page.getByTestId('specification-name').filter({ hasText: 'Weight' });
    await expect(weight).toContainText('in g');
    await expect(page.getByTestId('unit-symbol').filter({ hasText: /^Nm$/ })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Add a name' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add a Unit' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Change|Remove|Rename|Move) / })).toHaveCount(
      0,
    );
  });

  test('let an Administrator add a Unit and a name counted in it, and remove both', async ({
    page,
  }, testInfo) => {
    const symbol = `psi-${testInfo.project.name}`;
    const name = `Tyre pressure ${testInfo.project.name}`;

    await signIn(page);
    await page.goto('/specifications');

    await page.getByRole('button', { name: 'Add a Unit' }).click();
    await page.getByRole('textbox', { name: 'Symbol' }).fill(symbol);
    await page.getByRole('button', { name: 'Add to the list' }).click();
    const unit = page.getByTestId('unit').filter({ hasText: symbol });
    await expect(unit).toContainText('No name counted in it');

    await page.getByRole('button', { name: 'Add a name' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill(name);
    await page.getByRole('combobox', { name: 'Unit' }).selectOption({ label: symbol });
    await page.getByRole('button', { name: 'Add to the list' }).click();

    const entry = page.getByTestId('specification-name').filter({ hasText: name });
    await expect(entry).toContainText(`in ${symbol}`);

    // Counted in now, so removing the Unit is not offered.
    await expect(unit).toContainText('1 name counted in it');
    await expect(page.getByRole('button', { name: `Remove ${symbol}`, exact: true })).toHaveCount(
      0,
    );

    // A second spelling of a name already on the list is refused where it is typed.
    await page.getByRole('button', { name: 'Add a name' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill(name.toUpperCase());
    await page.getByRole('button', { name: 'Add to the list' }).click();
    await expect(page.getByRole('alert')).toContainText('already a Specification name');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: `Remove ${name}`, exact: true }).click();
    await expect(entry).toHaveCount(0);

    await page.getByRole('button', { name: `Remove ${symbol}`, exact: true }).click();
    await expect(unit).toHaveCount(0);
  });
});
