import { expect, test, type Page } from '@playwright/test';
import { markFor, openADrawingOfYourOwn, openFirstDrawing } from './support/archive.js';

/**
 * **The card a Mark shows on a pointer** (issue #35): what is at a number, read without
 * selecting it.
 *
 * Only a browser can say this, because it is about a pointer resting and a card appearing beside
 * the circle. The desktop project only: a phone has no pointer that rests, and on it a tap is a
 * selection, which `parts.spec.ts` covers.
 */
test.describe('the card beside a Mark', () => {
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

  test('is shown for keyboard focus as well', async ({ page }) => {
    await openFirstDrawing(page);

    await markFor(page, '1').first().focus();
    // Focus that a keyboard brought, so the card is shown for it.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');

    await expect(cardOf(page)).toBeVisible();
    await expect(page.getByTestId('selected-position')).toHaveCount(0);
  });

  test('never hides anything a click does not also show', async ({ page }) => {
    await openFirstDrawing(page);
    const mark = markFor(page, '1').first();

    await mark.hover();
    await expect(cardOf(page)).toBeVisible();
    await mark.click();

    // The click still reads the number, and the reading says everything the card did.
    await expect(page.getByTestId('selected-position')).toHaveText('1');
    await expect(page.getByTestId('part-reading')).toContainText('Front brake caliper, early');
    // The card holds nothing to press.
    await expect(cardOf(page).locator('button, a, input')).toHaveCount(0);
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
