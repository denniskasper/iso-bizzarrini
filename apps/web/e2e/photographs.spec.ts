import { expect, test, type Locator, type Page } from '@playwright/test';
import { borrowAnImage, openADrawingOfYourOwn, openFirstDrawing } from './support/archive.js';

/**
 * Photographs of a Part — **the check no part number can give anybody** (story 77).
 *
 * The API seam already proves that a photograph is stored privately, prepared at ingest and kept
 * in the order somebody chose. Only a browser can say the three things that actually matter to a
 * member: that the picture is *on the screen* where they are reading the part, that "larger"
 * really fills the glass, and that a part with no photographs says nothing rather than printing a
 * gap where one would be.
 *
 * And only a browser can prove the Editor's half of it: that a file picked off a phone becomes a
 * picture beside the drawing, and that reordering is something a cold hand can actually do.
 */

function reading(page: Page): Locator {
  return page.getByTestId('part-reading');
}

/** One picked file, from bytes borrowed out of the archive rather than committed here. */
function asUpload(name: string, bytes: Buffer) {
  return { name, mimeType: 'image/webp', buffer: bytes };
}

test.describe('reading a part that has been photographed', () => {
  /**
   * The practice archive's early caliper carries two, which is the only arrangement that can show
   * an *order*: one set large because it is the one that identifies the component, the rest as a
   * strip under it.
   */
  test('shows the part, with the one that identifies it first', async ({ page }) => {
    await openFirstDrawing(page);
    await page.locator('[data-testid="drawing-mark"][data-position="1"]').first().click();

    const caliper = page.locator('[data-testid="listed-part"]', {
      hasText: 'Front brake caliper, early',
    });
    await expect(caliper.getByTestId('photograph')).toHaveCount(2);

    // Rendered, not merely requested: a 404 image is "visible" too, and these are behind the gate.
    const lead = caliper.getByTestId('photograph').first().locator('img');
    await expect
      .poll(() => lead.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
  });

  /**
   * **Nothing where there is nothing**, which is the same rule the rest of this panel follows: a
   * Position carrying two alternatives and two fixings is four Parts, and four blocks saying "no
   * photographs" is a column of denials to read past to reach the one that has some.
   */
  test('says nothing at all about a part nobody has photographed', async ({ page }) => {
    await openFirstDrawing(page);
    await page.locator('[data-testid="drawing-mark"][data-position="1"]').first().click();

    const bolt = page.locator('[data-testid="listed-part"]', {
      hasText: 'Caliper mounting bolt',
    });
    await expect(bolt).toBeVisible();
    await expect(bolt.getByTestId('photographs')).toHaveCount(0);
  });

  /**
   * **Larger means the picture is the only thing on the glass** — which is what somebody holding
   * a bracket up against a phone actually wants, and the same answer the drawing gives. Stepping
   * between them is part of it: opening the second of two with no way to the first would send a
   * member back out to the strip to do it.
   */
  test('opens a photograph larger, steps to the next, and closes on Escape', async ({ page }) => {
    await openFirstDrawing(page);
    await page.locator('[data-testid="drawing-mark"][data-position="1"]').first().click();

    const caliper = page.locator('[data-testid="listed-part"]', {
      hasText: 'Front brake caliper, early',
    });
    await caliper.getByTestId('photograph').first().click();

    const expanded = page.getByTestId('photograph-expanded');
    await expect(expanded).toContainText('1 of 2');

    await page.getByRole('button', { name: 'Next photograph' }).click();
    await expect(expanded).toContainText('2 of 2');

    await page.keyboard.press('Escape');
    await expect(expanded).toHaveCount(0);
  });
});

test.describe('photographing a part', () => {
  /**
   * The whole of story 111 in one pass: an Editor picks files off a phone, the archive prepares
   * them without a word about formats, and what a member reads beside the drawing has them.
   *
   * Then the two things the panel exists for — deciding which picture comes first, and taking one
   * off — because a photograph uploaded by mistake that cannot be removed is worse than none.
   */
  test('uploads, reorders and removes, and the member’s panel follows', async ({ page }, info) => {
    const frame = page.getByTestId('drawing-frame');

    await openADrawingOfYourOwn(page, `photographs-${info.project.name}`);
    const bytes = await borrowAnImage(page);
    const box = await frame.boundingBox();
    if (!box) {
      throw new Error('The drawing has no frame.');
    }

    await page.getByRole('button', { name: 'Mark positions' }).click();
    await frame.click({ position: { x: box.width * 0.45, y: box.height * 0.45 } });
    await page.getByRole('button', { name: 'Done' }).click();

    await page.locator('[data-testid="drawing-mark"][data-position="1"]').click();
    await page.getByRole('button', { name: 'Record a part here' }).click();
    await page.getByLabel('Name (English)').fill('Steering idler arm');
    await page.getByRole('button', { name: 'Record this part' }).click();
    await expect(reading(page)).toContainText('Steering idler arm');

    // Nothing is said about photographs until there are some.
    await expect(reading(page).getByTestId('photographs')).toHaveCount(0);

    await page.getByRole('button', { name: 'Photographs' }).click();
    const editor = page.getByTestId('photograph-editor');

    // Two at once, which is what a phone full of them actually produces.
    await editor
      .locator('input[type="file"]')
      .setInputFiles([
        asUpload('idler-arm.webp', bytes),
        asUpload('idler-arm-casting-number.webp', bytes),
      ]);
    await page.getByRole('button', { name: 'Upload 2' }).click();

    await expect(editor.getByTestId('editable-photograph')).toHaveCount(2);
    // And the panel a member reads has them, without anything being asked for again.
    await expect(reading(page).getByTestId('photograph')).toHaveCount(2);

    /**
     * **Which one comes first is the work.** The lead is what a member sees without scrolling, so
     * moving the second one earlier has to change the picture at the top of their panel — which
     * is asserted by the address of the image, since that is the only thing that can distinguish
     * two photographs of the same part.
     */
    const lead = reading(page).getByTestId('photograph').first().locator('img');
    const wasLeading = await lead.getAttribute('src');

    await page.getByRole('button', { name: 'Move photograph 2 of 2 earlier' }).click();
    await expect(lead).not.toHaveAttribute('src', wasLeading ?? '');

    await page.getByRole('button', { name: 'Remove photograph 1 of 2' }).click();
    await expect(editor.getByTestId('editable-photograph')).toHaveCount(1);
    await expect(reading(page).getByTestId('photograph')).toHaveCount(1);
    // The one left is the one that was not removed, which is the one that had been leading.
    await expect(lead).toHaveAttribute('src', wasLeading ?? '');
  });
});
