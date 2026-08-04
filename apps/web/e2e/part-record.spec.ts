import { expect, test, type Locator, type Page } from '@playwright/test';
import { openADrawingOfYourOwn, openFirstDrawing } from './support/archive.js';

/**
 * What fits a Part, what can be bought instead of it, and where it has been available.
 *
 * The API seam already proves that a price cannot be *stored* without the date it was seen. Only
 * a browser can say that it is never **printed** without one — and that an Editor who tries is
 * told so on the screen rather than having the date quietly dropped. That is the whole reason
 * this file exists; everything else here is the same argument about states a response body
 * reports and a page has to render: a donor vehicle with no number, an offer that never said what
 * condition it was in.
 */

function reading(page: Page): Locator {
  return page.getByTestId('part-reading');
}

/** The practice archive's flexible brake hose, which is where all three are filled in. */
async function openTheHose(page: Page): Promise<void> {
  await openFirstDrawing(page);
  await page.locator('[data-testid="drawing-mark"][data-position="2"]').first().click();
  await expect(reading(page)).toContainText('Flexible brake hose');
}

test.describe('reading what fits a part and what replaces it', () => {
  /**
   * **The qualification in the words whoever knew it would use** (story 71), printed as it was
   * written — and a second car, because judging cross-model compatibility is the member's to do
   * and they cannot do it from one line.
   */
  test('a part says which cars it fits, and how each is qualified', async ({ page }) => {
    await openTheHose(page);

    const fits = page.getByTestId('fitments');
    await expect(fits).toContainText('Iso Grifo');
    await expect(fits).toContainText('Iso Rivolta IR 300');
    await expect(fits).toContainText('late cars only');
  });

  /**
   * The cross-reference from an unobtainable original to something purchasable, which is the most
   * valuable content the archive holds — **including the one that has no number at all.** A donor
   * vehicle is usually a car and nothing else, and a screen that printed a placeholder where the
   * reference goes would send somebody hunting for a number nobody has ever found.
   */
  test('a donor vehicle is read without a number, and without a gap where one would be', async ({
    page,
  }) => {
    await openTheHose(page);

    const equivalents = page.getByTestId('equivalents');
    await expect(equivalents).toContainText('Original supplier');
    await expect(equivalents).toContainText('Girling');
    await expect(equivalents).toContainText('64678231');

    await expect(equivalents).toContainText('Donor vehicle');
    await expect(equivalents).toContainText('Fiat 124 Coupé');
    // Nothing stands in for the number the archive does not have.
    await expect(equivalents).not.toContainText('None recorded');
    await expect(equivalents).not.toContainText('—');
  });

  /**
   * **The rule this ticket turns on, seen rather than inferred** (stories 75, 76). The amount and
   * the day it was seen are one sentence in one element, so there is nowhere on this screen for a
   * figure to be printed on its own — and the older of the two prices is still there, because two
   * prices on two dates is a price history and that is what a member is trying to read.
   */
  test('a price is never on the screen without the day it was seen', async ({ page }) => {
    await openTheHose(page);

    const prices = page.getByTestId('observed-price');
    await expect(prices).toHaveCount(2);
    await expect(prices.first()).toHaveText('€245.00 seen on 2 November 2025');
    await expect(prices.nth(1)).toHaveText('€190.00 seen on 18 March 2024');

    // And the archive says what the figures are, once, rather than leaving it to be assumed.
    await expect(page.getByTestId('sources')).toContainText('not what anything costs now');
  });

  /**
   * The first thing a restorer asks, answered — including where the answer is that nobody said.
   * A listing whose condition is unknown is not the same as a used part, and guessing between
   * them is how somebody buys a reproduction thinking it is new old stock.
   */
  test('an offer that did not say what condition it was in says that', async ({ page }) => {
    await openFirstDrawing(page);
    await page.locator('[data-testid="drawing-mark"][data-position="1"]').first().click();

    const caliper = page.locator('[data-testid="listed-part"]', {
      hasText: 'Front brake caliper, early',
    });
    await expect(caliper.getByTestId('sources')).toContainText('Condition not stated');
    // Nothing was invented to fill the gap, and no price appeared with it either.
    await expect(caliper.getByTestId('sources')).not.toContainText('New old stock');
    await expect(caliper.getByTestId('sources').getByTestId('observed-price')).toHaveCount(0);
  });
});

test.describe('recording where a part has been available', () => {
  /**
   * **Refused at the point of entry, on the screen, and not merely hidden at display**
   * (story 110). An Editor who types a price and forgets the date is told so and can fix it in
   * the box they are already in; nothing is written, so the archive never holds a figure it
   * would have to decide whether to print.
   */
  test('a price typed without its date is refused, and then accepted with one', async ({
    page,
  }, info) => {
    const frame = page.getByTestId('drawing-frame');

    await openADrawingOfYourOwn(page, `sources-${info.project.name}`);
    const box = await frame.boundingBox();
    if (!box) {
      throw new Error('The drawing has no frame.');
    }

    await page.getByRole('button', { name: 'Mark positions' }).click();
    await frame.click({ position: { x: box.width * 0.4, y: box.height * 0.4 } });
    await page.getByRole('button', { name: 'Done' }).click();

    await page.locator('[data-testid="drawing-mark"][data-position="1"]').click();
    await page.getByRole('button', { name: 'Record a part here' }).click();
    await page.getByLabel('Name (English)').fill('Water pump');
    await page.getByRole('button', { name: 'Record this part' }).click();
    await expect(reading(page)).toContainText('Water pump');

    await page.getByRole('button', { name: 'Fits, equivalents, sources' }).click();
    await page.getByRole('button', { name: 'Record a source' }).click();
    await page.getByLabel('Whose listing').fill('Ricambi Storici');
    await page.getByLabel('Link').fill('https://example.invalid/water-pump');
    await page.getByLabel('Price').fill('180.00');

    await page.getByRole('button', { name: 'Record this source' }).click();
    await expect(page.getByRole('alert')).toContainText('date it was seen');
    // Nothing was written, so nothing is being read beside the drawing either.
    await expect(reading(page).getByTestId('sources')).toHaveCount(0);

    await page.getByLabel('Seen on').fill('2025-09-14');
    await page.getByRole('button', { name: 'Record this source' }).click();

    // And the panel a member reads has it, with the price and the day as one sentence.
    await expect(reading(page).getByTestId('observed-price')).toHaveText(
      '€180.00 seen on 14 September 2025',
    );
  });

  /**
   * The cross-reference that has no number, recorded (story 109). It is the one an Editor is
   * likeliest to be talked out of by a form, and the one worth most: a car to go and look at.
   */
  test('a donor vehicle is recorded with no reference number at all', async ({ page }, info) => {
    const frame = page.getByTestId('drawing-frame');

    await openADrawingOfYourOwn(page, `equivalents-${info.project.name}`);
    const box = await frame.boundingBox();
    if (!box) {
      throw new Error('The drawing has no frame.');
    }

    await page.getByRole('button', { name: 'Mark positions' }).click();
    await frame.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
    await page.getByRole('button', { name: 'Done' }).click();

    await page.locator('[data-testid="drawing-mark"][data-position="1"]').click();
    await page.getByRole('button', { name: 'Record a part here' }).click();
    await page.getByLabel('Name (English)').fill('Wheel bearing, front');
    await page.getByRole('button', { name: 'Record this part' }).click();
    await expect(reading(page)).toContainText('Wheel bearing, front');

    await page.getByRole('button', { name: 'Fits, equivalents, sources' }).click();

    // A car it fits, qualified in words rather than in a date range.
    await page.getByRole('button', { name: 'Record a car it fits' }).click();
    await page.getByLabel('Car').selectOption({ label: 'Iso Grifo GL 365' });
    await page.getByLabel('Qualification').fill('from chassis #310');
    await page.getByRole('button', { name: 'Record this fitment' }).click();
    await expect(reading(page).getByTestId('fitments')).toContainText('from chassis #310');

    await page.getByRole('button', { name: 'Record an equivalent' }).click();
    await page.getByLabel('Kind').selectOption({ label: 'Donor vehicle' });
    await page.getByLabel('Maker, standard or car').fill('Fiat 124 Coupé');
    await page.getByRole('button', { name: 'Record this equivalent' }).click();

    const equivalents = reading(page).getByTestId('equivalents');
    await expect(equivalents).toContainText('Donor vehicle');
    await expect(equivalents).toContainText('Fiat 124 Coupé');
  });
});
