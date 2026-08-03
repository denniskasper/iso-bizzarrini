import { expect, test, type Locator, type Page } from '@playwright/test';
import { drawingOf, openADrawingOfYourOwn, openFirstDrawing } from './support/archive.js';

/**
 * Reading a part from a circle — **the sentence the whole product exists to complete**.
 *
 * What is asserted here is what a request and a response cannot say. The API seam already proves
 * that a Position carrying two drawn alternatives and two undrawn fixings reports them
 * distinguishably; only a browser can say that a member *sees* the difference, and that the
 * drawing is still on the screen while they read it.
 *
 * Both projects run it, and the phone is the one that matters: a Pixel 7 in a garage is where
 * "beside the drawing" either survives a small screen or does not.
 */

function reading(page: Page): Locator {
  return page.getByTestId('part-reading');
}

function partsIn(page: Page): Locator {
  return page.getByTestId('listed-part');
}

/** How a Part is ruled off — solid where the drawing shows it, broken where it does not. */
function ruleOf(part: Locator): Promise<string> {
  return part.evaluate((element) => getComputedStyle(element).borderLeftStyle);
}

test.describe('reading the part at a circle', () => {
  /**
   * The headline, and the whole of story 44: the Part appears **without the drawing
   * disappearing.** A member holding a bracket is looking at the circle its number came from,
   * and an archive that swapped the sheet for the text would be taking that away.
   */
  test('a circle read beside the drawing leaves the drawing on the screen', async ({ page }) => {
    await openFirstDrawing(page);

    await page.locator('[data-testid="drawing-mark"][data-position="1"]').first().click();

    await expect(page.getByTestId('selected-position')).toHaveText('1');
    await expect(reading(page)).toContainText('Front brake caliper, early');
    await expect(reading(page)).toContainText('260 03 150');

    // Which car, which sheet, which number — said by the Part itself (story 59), because a
    // member who followed a link here has not read the page header. It is assembled in the
    // browser from two queries, so this seam is the only one that can see it.
    await expect(reading(page)).toContainText('Iso Grifo');
    await expect(reading(page)).toContainText('Tavola 2');
    await expect(reading(page)).toContainText('Front brake system');

    // Still on the glass, not merely still in the document.
    await expect(drawingOf(page)).toBeInViewport();
  });

  /**
   * **The distinction a member cannot afford to misread.** Two drawn Parts at one Position are
   * fitted instead of one another; the undrawn ones sharing it are needed as well. Buying one
   * when three were wanted is the failure, so it is asserted in words *and* in the rule down the
   * side — the same broken rule the sheet's own numbers wear for "listed but not drawn".
   */
  test('alternatives are visibly not the same thing as the fixings beside them', async ({
    page,
  }) => {
    await openFirstDrawing(page);
    await page.locator('[data-testid="drawing-mark"][data-position="1"]').first().click();

    await expect(partsIn(page)).toHaveCount(4);
    await expect(reading(page)).toContainText('Alternatives');
    await expect(reading(page)).toContainText('The car takes one of these, not all of them');
    await expect(reading(page)).toContainText('Also needed');
    await expect(reading(page)).toContainText('fitted as well');

    const drawn = page.locator('[data-testid="listed-part"][data-drawn="true"]');
    const undrawn = page.locator('[data-testid="listed-part"][data-drawn="false"]');
    await expect(drawn).toHaveCount(2);
    await expect(undrawn).toHaveCount(2);

    // Seen, and not only marked up: the two groups are ruled differently.
    expect(await ruleOf(drawn.first())).toBe('solid');
    expect(await ruleOf(undrawn.first())).toBe('dashed');
  });

  // Evidence and interpretation, told apart before either is read (story 62). Nobody may
  // "improve" the factory's transcription, and nothing may run the two together.
  test('the factory’s words are kept apart from the club’s', async ({ page }) => {
    await openFirstDrawing(page);
    await page.locator('[data-testid="drawing-mark"][data-position="1"]').first().click();

    const caliper = partsIn(page).first();
    await expect(caliper.getByTestId('catalog-note')).toContainText('FINO AL TELAIO N. 310');
    await expect(caliper.getByTestId('catalog-note')).toContainText('From the factory catalog');
    await expect(caliper.getByTestId('club-note')).toContainText('narrow pad');
    // Two blocks, and the club's text is in neither of the factory's.
    await expect(caliper.getByTestId('catalog-note')).not.toContainText('narrow pad');
  });

  // A Part with no factory number is ordinary, and the screen says so rather than printing a
  // placeholder somebody would go looking for (ADR 0001, story 58).
  test('a part with no catalog number says so plainly', async ({ page }) => {
    await openFirstDrawing(page);
    await page.locator('[data-testid="position-chip"][data-position="3"]').click();

    await expect(reading(page)).toContainText('Bleed screw');
    await expect(partsIn(page).first().getByTestId('catalog-number')).toHaveText('None recorded');
    await expect(reading(page)).toContainText('Not every part was given a catalog number');
  });

  // What keeping one Part rather than one row per drawing buys a member (story 68).
  test('a part says which other drawings it appears on', async ({ page }) => {
    await openFirstDrawing(page);
    await page.locator('[data-testid="drawing-mark"][data-position="1"]').first().click();

    const bolt = page.locator('[data-testid="listed-part"]', {
      hasText: 'Caliper mounting bolt',
    });
    await expect(bolt).toContainText('Also on');
    await expect(bolt.getByRole('link', { name: /Tavola 10/ })).toBeVisible();
    // Four here, six there — the reason a quantity belongs to a Listing and not to a Part.
    await expect(bolt).toContainText('×4 per car');
    await expect(bolt).toContainText('×6');
  });

  // "Not known" and "not yet clicked" are different things (story 45).
  test('a number with nothing recorded at it says that, rather than nothing', async ({ page }) => {
    await openFirstDrawing(page);
    await page.locator('[data-testid="drawing-mark"][data-position="4"]').first().click();

    await expect(reading(page)).toContainText('Nothing is recorded at this position yet');
  });
});

test.describe('recording a part', () => {
  /**
   * **The merge-or-correct rule, driven** (ADR 0001, story 102).
   *
   * A Catalog Number the archive already holds is not an error to route around — it is the
   * archive telling an Editor that they are describing something it already has. The refusal
   * arrives carrying that Part, and listing it here is one press. There is deliberately no third
   * way past this screen that records a second copy of the same component.
   */
  test('a catalog number already in use is merged rather than duplicated', async ({
    page,
  }, info) => {
    // Unique per project, because chromium and the phone write to one archive — and the whole
    // rule under test is that this number may exist exactly once in it.
    const number = `700 00 ${info.project.name === 'mobile' ? '002' : '001'}`;
    const frame = page.getByTestId('drawing-frame');

    await openADrawingOfYourOwn(page, `parts-${info.project.name}`);
    const box = await frame.boundingBox();
    if (!box) {
      throw new Error('The drawing has no frame.');
    }

    // Two numbers on the sheet, placed the way an Editor places them.
    await page.getByRole('button', { name: 'Mark positions' }).click();
    await frame.click({ position: { x: box.width * 0.3, y: box.height * 0.3 } });
    await frame.click({ position: { x: box.width * 0.7, y: box.height * 0.6 } });
    await page.getByRole('button', { name: 'Done' }).click();

    await page.locator('[data-testid="drawing-mark"][data-position="1"]').click();
    await page.getByRole('button', { name: 'Record a part here' }).click();
    await page.getByLabel('Name (English)').fill('Throttle return spring');
    await page.getByLabel('Catalog number').fill(number);
    await page.getByLabel('Quantity per car').fill('2');
    await page.getByRole('button', { name: 'Record this part' }).click();

    await expect(reading(page)).toContainText('Throttle return spring');
    await expect(partsIn(page)).toHaveCount(1);

    // The same number again, at the other Position, described as something else.
    await page.locator('[data-testid="drawing-mark"][data-position="2"]').click();
    await page.getByRole('button', { name: 'Record a part here' }).click();
    await page.getByLabel('Name (English)').fill('Return spring, throttle linkage');
    await page.getByLabel('Catalog number').fill(number);
    await page.getByRole('button', { name: 'Record this part' }).click();

    // Refused, and the refusal shows what already has the number.
    const clash = page.getByTestId('catalog-number-clash');
    await expect(clash).toContainText('That number is already recorded');
    await expect(clash).toContainText('Throttle return spring');
    await expect(partsIn(page)).toHaveCount(0);

    await clash.getByRole('button', { name: 'List that part here' }).click();

    // One Part, now listed at both numbers — which is what "the same part on two drawings stays
    // one part" looks like from the outside.
    await expect(partsIn(page)).toHaveCount(1);
    await expect(reading(page)).toContainText('Throttle return spring');
    await expect(reading(page)).not.toContainText('Return spring, throttle linkage');
  });

  /**
   * A fastener recorded as undrawn is what lets a member order the screws with the bracket
   * (story 64) — and it is the flag that decides whether they read it as an alternative.
   */
  test('a fixing is recorded undrawn and reads as also needed', async ({ page }, info) => {
    const frame = page.getByTestId('drawing-frame');

    await openADrawingOfYourOwn(page, `fixings-${info.project.name}`);
    const box = await frame.boundingBox();
    if (!box) {
      throw new Error('The drawing has no frame.');
    }

    await page.getByRole('button', { name: 'Mark positions' }).click();
    await frame.click({ position: { x: box.width * 0.4, y: box.height * 0.4 } });
    await page.getByRole('button', { name: 'Done' }).click();

    await page.locator('[data-testid="drawing-mark"][data-position="1"]').click();

    await page.getByRole('button', { name: 'Record a part here' }).click();
    await page.getByLabel('Name (English)').fill('Mounting bracket');
    await page.getByRole('button', { name: 'Record this part' }).click();
    await expect(partsIn(page)).toHaveCount(1);

    await page.getByRole('button', { name: 'Record a part here' }).click();
    await page.getByLabel('Name (English)').fill('Bracket screw');
    await page.getByTestId('listing-drawn').uncheck();
    await page.getByRole('button', { name: 'Record this part' }).click();

    await expect(partsIn(page)).toHaveCount(2);
    await expect(reading(page)).toContainText('Also needed');

    const screw = page.locator('[data-testid="listed-part"]', { hasText: 'Bracket screw' });
    await expect(screw).toHaveAttribute('data-drawn', 'false');
    expect(await ruleOf(screw)).toBe('dashed');
  });
});
