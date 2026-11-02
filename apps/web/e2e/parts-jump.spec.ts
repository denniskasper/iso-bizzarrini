import { expect, test, type Locator, type Page } from '@playwright/test';
import { openFirstDrawing } from './support/archive.js';

/**
 * **Up to the number, down to the end of the list** (issue #213). A sheet with a lot of parts is a
 * long way to scroll with a cold thumb, so the parts list carries a pair of arrows: one back to
 * the head of the facing page, one to the last row of the sheet's parts.
 *
 * The practice sheet is short, so the window is made shorter than its list instead: what decides
 * whether the arrows are there is the list against the window, and never the count of parts.
 */

function up(page: Page) {
  return page.getByRole('button', { name: 'Back to the top of the parts' });
}

function down(page: Page) {
  return page.getByRole('button', { name: 'To the end of the parts' });
}

/**
 * Where a button sits: centred on the list, and at the edge of the window it goes to — ↑ just
 * under the chrome, ↓ just above the window's foot.
 */
async function expectAtTheEdge(page: Page, button: Locator, edge: 'top' | 'bottom') {
  const box = await button.boundingBox();
  const list = await page.getByTestId('sheet-parts').boundingBox();
  const height = page.viewportSize()?.height ?? 0;
  const chrome = await page.evaluate(
    () =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chrome-height')) ||
      0,
  );
  expect(box && list).toBeTruthy();
  if (!box || !list) {
    return;
  }
  expect(Math.abs(box.x + box.width / 2 - (list.x + list.width / 2))).toBeLessThan(4);
  // Within a rem and a little of the edge, whatever the chrome or the window measures.
  if (edge === 'top') {
    expect(box.y - chrome).toBeGreaterThanOrEqual(0);
    expect(box.y - chrome).toBeLessThan(32);
  } else {
    expect(height - (box.y + box.height)).toBeGreaterThanOrEqual(0);
    expect(height - (box.y + box.height)).toBeLessThan(32);
  }
}

/** The top of the list just under the chrome, where a member scrolling down first meets it. */
async function bringTheListIn(page: Page): Promise<void> {
  await page.getByTestId('sheet-parts').evaluate((list) => {
    const chrome =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chrome-height')) ||
      0;
    window.scrollBy(0, list.getBoundingClientRect().top - chrome - 8);
  });
}

/** The same width the project gives, and a window too short to hold the list. */
async function aShortWindow(page: Page): Promise<void> {
  const width = page.viewportSize()?.width ?? 1280;
  await page.setViewportSize({ width, height: 420 });
}

test('a list taller than the window can be jumped down and back up', async ({ page }) => {
  // Shortened once the drawing is open: on a phone the chrome alone fills most of a short window,
  // and the way to the drawing would be under it.
  await openFirstDrawing(page);
  await aShortWindow(page);

  // Nothing while the list is not on the screen: the arrows never sit over the drawing.
  await expect(down(page)).toBeHidden();

  await bringTheListIn(page);
  await expect(down(page)).toBeVisible();
  await expectAtTheEdge(page, down(page), 'bottom');
  // The top of the list is in view, so the head of the page is a short scroll away already.
  await expect(up(page)).toBeHidden();

  await down(page).click();
  // The last row of the sheet's parts is on the screen, and there is nowhere further down to go.
  await expect(page.getByTestId('sheet-parts').getByRole('listitem').last()).toBeInViewport();
  await expect(down(page)).toBeHidden();
  // Focus carries on from the last row, so the next Tab goes on down the page, not back up it.
  await expect(
    page.getByTestId('sheet-parts').getByRole('listitem').last().getByRole('button'),
  ).toBeFocused();
  await expect(up(page)).toBeVisible();
  await expectAtTheEdge(page, up(page), 'top');

  await up(page).click();
  // The head of the facing page: the number box, which is scrolled to and not typed into.
  await expect(page.getByTestId('position-jump')).toBeInViewport();
  await expect(page.getByTestId('position-jump')).not.toBeFocused();
  // Focus carries on from the head of the column, so the next Tab is the number box.
  await expect(page.getByTestId('part-panel')).toBeFocused();
  await expect(up(page)).toBeHidden();
});

test('a list the window already holds has no arrows', async ({ page }) => {
  const width = page.viewportSize()?.width ?? 1280;
  await page.setViewportSize({ width, height: 2400 });
  await openFirstDrawing(page);

  await page.getByTestId('sheet-parts').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('sheet-parts').getByRole('listitem').last()).toBeInViewport();
  await expect(down(page)).toHaveCount(0);
  await expect(up(page)).toHaveCount(0);
});
