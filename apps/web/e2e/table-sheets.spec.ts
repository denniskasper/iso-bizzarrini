import { expect, test } from '@playwright/test';
import { expectTheSheetIsDrawn, openFirstDrawing } from './support/archive.js';

/**
 * **A table sheet opens in the drawing's viewer** (issue #230), on the Tavola, with the same zoom
 * as the drawing, instead of as a bare image in a new tab.
 *
 * The practice archive gives the Grifo's Tavola 2 one invented sheet.
 */
test('a table sheet opens on the Tavola, zooms, and closes again', async ({ page }) => {
  await openFirstDrawing(page);

  const sheets = page.getByTestId('table-sheets');
  await sheets.scrollIntoViewIfNeeded();
  const open = sheets.getByRole('button', { name: 'Sheet 1', exact: true });
  await expect(open).toHaveAttribute('aria-pressed', 'false');
  // Nothing on the page leaves it for the sheet.
  await expect(sheets.locator('a[target="_blank"]')).toHaveCount(0);

  await open.click();
  await expect(open).toHaveAttribute('aria-pressed', 'true');

  const sheet = sheets.getByRole('img', { name: 'Table sheet 1' });
  await expect(sheet).toBeVisible();
  await expectTheSheetIsDrawn(sheet);

  const viewer = sheets.getByTestId('drawing-stage');
  await expect(viewer.getByTestId('drawing-magnification')).toHaveText('×1.0');
  await viewer.getByRole('button', { name: 'Zoom in' }).click();
  await expect(viewer.getByTestId('drawing-magnification')).not.toHaveText('×1.0');

  await sheets.getByRole('button', { name: 'Close sheet 1' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(open).toHaveAttribute('aria-pressed', 'false');
});
