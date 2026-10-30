import { expect, test } from '@playwright/test';
import { openADrawingOfYourOwn } from './support/archive.js';
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

/**
 * A Part's Specifications (issue #112), recorded and read. Thin, like the rest of this file: what
 * a value may be, the suggestions and who may write one are proved at the API seam. What is here
 * is that the Unit is shown beside the box rather than asked for, that a comma is taken, and that
 * the panel a member reads has it, name, value and Unit.
 */
test.describe('a Part’s Specifications', () => {
  test('an Editor records a weight with a comma, and it is read with its Unit', async ({
    page,
  }, info) => {
    const frame = page.getByTestId('drawing-frame');
    const reading = page.getByTestId('part-reading');

    await openADrawingOfYourOwn(page, `specifications-${info.project.name}`);
    const box = await frame.boundingBox();
    if (!box) {
      throw new Error('The drawing has no frame.');
    }

    await page.getByRole('button', { name: 'Mark positions' }).click();
    await frame.click({ position: { x: box.width * 0.45, y: box.height * 0.45 } });
    await page.getByRole('button', { name: 'Done' }).click();

    await page.locator('[data-testid="drawing-mark"][data-position="1"]').click();
    await page.getByRole('button', { name: 'Record a part here' }).click();
    await page.getByLabel('Name (English)').fill('Door handle');
    await page.getByRole('button', { name: 'Record this part' }).click();
    await expect(reading).toContainText('Door handle');
    // Nothing recorded, so nothing is shown for it.
    await expect(reading.getByTestId('specifications')).toHaveCount(0);

    await page.getByRole('button', { name: 'Specifications, fits, equivalents, sources' }).click();
    await page.getByRole('button', { name: 'Record a specification' }).click();
    await page.getByRole('combobox', { name: 'Name' }).selectOption({ label: 'Weight (g)' });
    // The Unit is the name's: printed beside the box, and nowhere to choose it.
    await expect(page.getByTestId('specification-unit')).toHaveText('g');

    const value = page.getByRole('textbox', { name: 'Value' });
    await value.fill('about 400');
    await page.getByRole('button', { name: 'Record this specification' }).click();
    await expect(page.getByRole('alert')).toContainText('is a number in g');

    await value.fill('412,5');
    await page.getByRole('button', { name: 'Record this specification' }).click();

    const weight = reading.getByTestId('specification').filter({ hasText: 'Weight' });
    await expect(weight).toContainText('412.5 g');
  });
});
