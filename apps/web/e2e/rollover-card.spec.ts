import { expect, test, type Page } from '@playwright/test';
import { markFor, openADrawingOfYourOwn, openFirstDrawing } from './support/archive.js';

/**
 * **The card a Mark shows on a pointer** (issue #35): what is at a number, read without
 * selecting it, and never over the drawing it is about.
 *
 * Only a browser can say this, because it is about a pointer resting and where a card appears.
 * The desktop project only: a phone has no pointer that rests, and on it a tap is a selection,
 * which `parts.spec.ts` covers. Where there is no column beside the drawing, a narrow window with
 * a mouse stands in for it.
 */
test.describe('the card for a Mark', () => {
  test.skip(({ hasTouch }) => hasTouch, 'A touch screen has no hover.');

  function cardOf(page: Page) {
    return page.getByTestId('mark-card');
  }

  test('says what is at the number without selecting it', async ({ page }) => {
    await openFirstDrawing(page);

    await markFor(page, '1').first().hover();

    const card = cardOf(page);
    await expect(card).toBeVisible();
    await expect(page.getByTestId('mark-card-number')).toHaveText('1');
    // The two drawn alternatives, named and numbered, and the fixings as a count.
    await expect(page.getByTestId('mark-card-part')).toHaveCount(2);
    await expect(card).toContainText('Front brake caliper, early');
    await expect(card).toContainText('260 03 150');
    await expect(page.getByTestId('mark-card-undrawn')).toHaveText('+ 2 fasteners');

    // Pointed at, not read: nothing was selected.
    await expect(page.getByTestId('selected-position')).toHaveCount(0);

    await page.mouse.move(0, 0);
    await expect(card).toHaveCount(0);
  });

  test('is beside the drawing, never over it', async ({ page }) => {
    await openFirstDrawing(page);

    await markFor(page, '1').first().hover();

    const card = await cardOf(page).locator('..').boundingBox();
    const stage = await page.getByTestId('drawing-stage').boundingBox();
    expect(card).not.toBeNull();
    expect(stage).not.toBeNull();
    // Wholly to the right of the sheet, in the column, and level with it.
    expect(card!.x).toBeGreaterThanOrEqual(stage!.x + stage!.width);
    expect(card!.y).toBeGreaterThanOrEqual(stage!.y - 1);
    expect(card!.y + card!.height).toBeLessThanOrEqual(stage!.y + stage!.height + 1);
  });

  test('gives the column back to the selected number when the pointer leaves', async ({ page }) => {
    await openFirstDrawing(page);
    await markFor(page, '1').first().click();
    await expect(page.getByTestId('selected-position')).toHaveText('1');

    await markFor(page, '2').first().hover();
    await expect(page.getByTestId('mark-card-number')).toHaveText('2');

    await page.mouse.move(0, 0);
    await expect(cardOf(page)).toHaveCount(0);
    await expect(page.getByTestId('selected-position')).toHaveText('1');
  });

  test('is a strip along the drawing where there is no column', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await openFirstDrawing(page);

    await markFor(page, '1').first().hover();

    const card = await cardOf(page).locator('..').boundingBox();
    const stage = await page.getByTestId('drawing-stage').boundingBox();
    const mark = await markFor(page, '1').first().boundingBox();
    expect(card).not.toBeNull();
    expect(stage).not.toBeNull();
    expect(mark).not.toBeNull();
    // Across the stage, at its top or bottom edge, and clear of the circle it is about.
    expect(card!.width).toBeGreaterThan(stage!.width * 0.9);
    const atTop = Math.abs(card!.y - stage!.y) < 24;
    const atBottom = Math.abs(stage!.y + stage!.height - (card!.y + card!.height)) < 24;
    expect(atTop || atBottom).toBe(true);
    const overlaps = mark!.y < card!.y + card!.height && card!.y < mark!.y + mark!.height;
    expect(overlaps).toBe(false);
  });

  test('is shown for keyboard focus as well', async ({ page }) => {
    await openFirstDrawing(page);

    await markFor(page, '1').first().focus();
    // Focus that a keyboard brought, so the card is shown for it.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');

    await expect(cardOf(page)).toBeVisible();
    await expect(page.getByTestId('selected-position')).toHaveCount(0);
    // The circle is described by the card, wherever the card is.
    await expect(markFor(page, '1').first()).toHaveAttribute('aria-describedby', 'mark-card');
  });

  test('never hides anything a click does not also show', async ({ page }) => {
    await openFirstDrawing(page);
    const mark = markFor(page, '1').first();

    await mark.hover();
    await expect(cardOf(page)).toBeVisible();
    // The card holds nothing to press.
    await expect(cardOf(page).locator('button, a, input')).toHaveCount(0);
    await mark.click();

    // The click still reads the number, and the reading says everything the card did.
    await expect(page.getByTestId('selected-position')).toHaveText('1');
    await expect(page.getByTestId('part-reading')).toContainText('Front brake caliper, early');
  });

  test('says when nothing is recorded at the number', async ({ page }, info) => {
    await openADrawingOfYourOwn(page, `card-${info.project.name}`);
    const tavolaId = /\/tavole\/([^/?]+)/.exec(page.url())?.[1];
    await page.request.post(`/api/tavole/${tavolaId}/marks`, {
      data: { number: '7', x: 0.5, y: 0.5 },
    });
    await page.reload();

    await markFor(page, '7').hover();

    await expect(cardOf(page)).toContainText('Nothing recorded here');
  });

  test('is a reading card on a small laptop, not a corner thumbnail', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openFirstDrawing(page);

    await markFor(page, '1').first().hover();

    const card = cardOf(page).locator('..');
    const box = await card.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(19 * 16);
    // Every line it holds, not only the card: a quiet line is muted, never smaller.
    const smallest = await card.evaluate((element) =>
      Math.min(
        ...[element, ...element.querySelectorAll('*')].map((each) =>
          parseFloat(getComputedStyle(each).fontSize),
        ),
      ),
    );
    expect(smallest).toBeGreaterThanOrEqual(16);
  });
});
