import { expect, test } from '@playwright/test';
import { forThisAttempt, openADrawingOfYourOwn, openGrifo } from './support/archive.js';
import { landed, PRACTICE, signIn, signInAs } from './support/gate.js';

/**
 * Categories in a real browser (issue #8): going straight to one system of a car, and to the
 * same system on every car.
 *
 * Thin, like the rest of this seam. What is on the list, who may change it and what a filter
 * may hide are all proved at the API seam; what is here is what only a browser can show — that
 * the choice lives in the address and survives a reload, and that a member can get from a car
 * to a system and back without a dead end.
 *
 * The suite runs in parallel against one archive, and other files put drawings of their own on
 * the Rivolta under Brakes. So nothing here counts what the whole archive holds: each test
 * names the drawings it is about.
 */
test.describe('one system of the car', () => {
  test('narrows a car’s drawings to a Category, and keeps the choice in the address', async ({
    page,
  }) => {
    await signInAs(page, PRACTICE.member);
    await landed(page);
    await openGrifo(page);

    const sheet = page.getByTestId('tavola-sheet');
    await expect(sheet.getByTestId('tavola-plate')).toHaveCount(3);

    const filter = page.getByTestId('category-filter');
    await filter.getByRole('link', { name: /^Electrical/ }).click();

    await expect(sheet.getByTestId('tavola-plate')).toHaveCount(1);
    await expect(sheet).toContainText('Impianto elettrico');
    await expect(page).toHaveURL(/\?category=electrical$/);

    // A reload is what a phone does when it comes back from the bottom of a toolbox.
    await page.reload();
    await expect(sheet.getByTestId('tavola-plate')).toHaveCount(1);
    await expect(filter.getByRole('link', { name: /^Electrical/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Every entry is the same page with a different question; only one of them is the answer.
    await expect(filter.locator('[aria-current]')).toHaveCount(1);

    await filter.getByRole('link', { name: /^All/ }).click();
    await expect(sheet.getByTestId('tavola-plate')).toHaveCount(3);
    await expect(page).not.toHaveURL(/category=/);
  });

  test('leads from a car’s brakes to the brakes of every car, and back to a car', async ({
    page,
  }) => {
    await signInAs(page, PRACTICE.member);
    await landed(page);
    await openGrifo(page);

    await page
      .getByTestId('category-filter')
      .getByRole('link', { name: /^Brakes/ })
      .click();
    await page.getByTestId('category-across-cars').click();

    await expect(page.getByRole('heading', { level: 1, name: 'Brakes' })).toBeVisible();

    // The same system on two cars the factory built differently — which is the comparison.
    const grifo = page.getByTestId('category-model').filter({ hasText: 'Grifo' });
    const strada = page.getByTestId('category-model').filter({ hasText: '5300 GT Strada' });
    await expect(grifo).toContainText('Impianto frenante anteriore');
    await expect(strada).toContainText('Impianto frenante');

    // Picking a car from here arrives at that car's brakes, not at all of its drawings.
    await strada.getByRole('link', { name: /5300 GT Strada/ }).click();
    await expect(page).toHaveURL(/\?category=brakes$/);
    await expect(page.getByTestId('tavola-sheet').getByTestId('tavola-plate')).toHaveCount(1);
  });

  test('is reachable from the front door and from a drawing', async ({ page }) => {
    await signInAs(page, PRACTICE.member);
    await landed(page);

    await page.getByTestId('categories-from-the-catalog').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Categories' })).toBeVisible();

    const index = page.getByTestId('category-index');
    await expect(index.getByRole('link', { name: 'Brakes' })).toBeVisible();
    // An entry nobody has drawn yet is on the list all the same.
    await expect(
      index.getByTestId('category-row').filter({ hasText: 'Anti-Roll Bar' }),
    ).toContainText('Nothing filed yet');

    // A member reads the list. Keeping it is an Administrator's.
    await expect(page.getByRole('button', { name: 'Add a Category' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Rename/ })).toHaveCount(0);

    await index.getByRole('link', { name: 'Electrical' }).click();
    await page.getByTestId('tavola-plate').first().click();
    await page.getByTestId('tavola-category').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Electrical' })).toBeVisible();
  });
});

test.describe('keeping the list', () => {
  test('lets an Administrator add a Category and rename it', async ({ page }, testInfo) => {
    // Both projects run this against one archive, so each needs a name of its own.
    const added = `Heating ${testInfo.project.name}`;
    const renamed = `Heating and Ventilation ${testInfo.project.name}`;

    await signIn(page);
    await page.goto('/categories');

    await page.getByRole('button', { name: 'Add a Category' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill(added);
    await page.getByRole('button', { name: 'Add to the list' }).click();

    const index = page.getByTestId('category-index');
    await expect(index.getByRole('link', { name: added, exact: true })).toBeVisible();

    await page.getByRole('button', { name: `Rename ${added}`, exact: true }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill(renamed);
    await page.getByRole('button', { name: 'Rename', exact: true }).click();

    await expect(index.getByRole('link', { name: renamed, exact: true })).toBeVisible();
    await expect(index.getByRole('link', { name: added, exact: true })).toHaveCount(0);
  });

  test('refuses a second spelling of a Category that is already on the list', async ({ page }) => {
    await signIn(page);
    await page.goto('/categories');

    await page.getByRole('button', { name: 'Add a Category' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('brakes');
    await page.getByRole('button', { name: 'Add to the list' }).click();

    await expect(page.getByRole('alert')).toContainText('already a Category');
  });
});

test.describe('filing a drawing', () => {
  test('moves it between Categories, and never loses one filed under none', async ({
    page,
  }, testInfo) => {
    const number = forThisAttempt(`C8 ${testInfo.project.name}`);
    await openADrawingOfYourOwn(page, number);

    // It was recorded under Brakes; an Editor decides it is the steering after all.
    const category = page.getByLabel('Category');
    await category.selectOption({ label: 'Steering' });
    await expect(page.getByTestId('tavola-category')).toHaveText('Steering');

    // And then that nobody is sure. Filed under nothing, it says nothing…
    await category.selectOption({ label: 'No Category yet' });
    await expect(page.getByTestId('tavola-category')).toHaveCount(0);

    // …and is still on its car, where asking for the unfiled drawings finds it. By address
    // rather than through the filter: the filter is only offered once a car's drawings fall
    // under more than one choice, and how many this car has depends on what else is running.
    await page.getByRole('link', { name: /Rivolta IR 300/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Rivolta');
    await page.goto(`${new URL(page.url()).pathname}?category=uncategorised`);

    await expect(page.getByText('not filed under a Category yet')).toBeVisible();
    await expect(page.getByTestId('tavola-plate').filter({ hasText: number })).toBeVisible();
  });
});
