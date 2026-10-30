import { expect, test, type Page } from '@playwright/test';
import {
  borrowAnImage,
  markFor,
  openADrawingOfYourOwn,
  openFirstDrawing,
} from './support/archive.js';
import { MEMBER_PASSWORD, PRACTICE, signInAs } from './support/gate.js';

/**
 * **A Sub-assembly's own page** (issue #110), through the screens.
 *
 * The API seam proves what the page carries and who may read and write it. What only a browser
 * can say is that the page is reached from the drawing, leads back to it, and that a link to it
 * survives the sign-in screen — the same promise a link to a Position makes.
 *
 * The practice archive's *Front caliper assembly*, on the Grifo's first sheet, holds `1`, `3` and
 * `5`.
 */

async function openTheCaliperAssembly(page: Page): Promise<void> {
  await openFirstDrawing(page);
  await markFor(page, '1').first().click();
  await page.getByTestId('sub-assembly-link').click();
  await expect(page.getByRole('heading', { name: 'Front caliper assembly' })).toBeVisible();
}

test.describe('a Sub-assembly’s page', () => {
  test('is opened from a number in it, and leads back to its numbers on the drawing', async ({
    page,
  }) => {
    await openTheCaliperAssembly(page);

    const numbers = page.getByTestId('sub-assembly-number');
    await expect(numbers).toHaveCount(3);
    await expect(numbers.first()).toContainText('Front brake caliper');

    await page.locator('[data-testid="sub-assembly-number"][data-position="3"]').click();
    await expect(page.getByTestId('selected-position')).toHaveText('3');
  });

  test('is opened from its name in the list beside the drawing', async ({ page }) => {
    await openFirstDrawing(page);

    await page
      .getByTestId('sheet-sub-assemblies')
      .getByRole('link', { name: /Front caliper assembly/ })
      .click();
    await expect(page.getByRole('heading', { name: 'Front caliper assembly' })).toBeVisible();
  });

  test('survives the sign-in screen, and is refused a lapsed member', async ({ page }) => {
    await openTheCaliperAssembly(page);
    const address = new URL(page.url()).pathname;

    await page.context().clearCookies();
    await page.goto(address);
    await expect(page.getByRole('heading', { name: 'The archive is members-only.' })).toBeVisible();

    await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
    await page.getByLabel('E-mail address').fill(PRACTICE.member);
    await page.getByLabel('Password').fill(MEMBER_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe(address);
    await expect(page.getByRole('heading', { name: 'Front caliper assembly' })).toBeVisible();

    await page.context().clearCookies();
    await signInAs(page, PRACTICE.lapsed);
    await expect(page.getByRole('heading', { name: 'Your Membership has run out.' })).toBeVisible();
    await page.goto(address);
    await expect(page.getByRole('heading', { name: 'Your Membership has run out.' })).toBeVisible();
    await expect(page.getByTestId('sub-assembly-page')).toHaveCount(0);
  });

  test('carries a Note an Editor writes, changes and clears', async ({ page }, info) => {
    await openADrawingOfYourOwn(page, `sub-assembly-${info.project.name}`);
    const tavolaId = new URL(page.url()).pathname.split('/').at(-1) ?? '';

    // Arranged over the API: recording a Sub-assembly through its panel is `belongs-with`'s.
    const sheet = (await (
      await page.request.post(`/api/tavole/${tavolaId}/positions`, { data: { number: '7' } })
    ).json()) as { positions: { id: string }[] };
    const recorded = (await (
      await page.request.post(`/api/tavole/${tavolaId}/sub-assemblies`, {
        data: { name: 'Door Lock', positionIds: sheet.positions.map((one) => one.id) },
      })
    ).json()) as { subAssemblies: { id: string }[] };

    await page.goto(`/tavole/${tavolaId}/sub-assemblies/${recorded.subAssemblies[0]?.id ?? ''}`);
    await expect(page.getByRole('heading', { name: 'Door Lock' })).toBeVisible();

    await page.getByRole('button', { name: 'Write a note' }).click();
    await page.getByLabel('The note about Door Lock').fill('Fitted from inside the door.');
    await page.getByRole('button', { name: 'Save the note' }).click();
    await expect(page.getByTestId('sub-assembly-note-text')).toHaveText(
      'Fitted from inside the door.',
    );

    await page.reload();
    await expect(page.getByTestId('sub-assembly-note-text')).toHaveText(
      'Fitted from inside the door.',
    );

    await page.getByRole('button', { name: 'Change the note' }).click();
    await page.getByLabel('The note about Door Lock').fill('');
    await page.getByRole('button', { name: 'Save the note' }).click();
    await expect(page.getByTestId('sub-assembly-note-text')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Write a note' })).toBeVisible();
  });

  /**
   * **Its Photographs** (issue #114): added, put in order and removed by an Editor on the page,
   * and the one first in the order is the one set large.
   */
  test('carries Photographs an Editor adds, orders and removes', async ({ page }, info) => {
    await openADrawingOfYourOwn(page, `sub-assembly-photographs-${info.project.name}`);
    const tavolaId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
    const bytes = await borrowAnImage(page);

    const sheet = (await (
      await page.request.post(`/api/tavole/${tavolaId}/positions`, { data: { number: '7' } })
    ).json()) as { positions: { id: string }[] };
    const recorded = (await (
      await page.request.post(`/api/tavole/${tavolaId}/sub-assemblies`, {
        data: { name: 'Window Slider', positionIds: sheet.positions.map((one) => one.id) },
      })
    ).json()) as { subAssemblies: { id: string }[] };

    await page.goto(`/tavole/${tavolaId}/sub-assemblies/${recorded.subAssemblies[0]?.id ?? ''}`);
    await expect(page.getByRole('heading', { name: 'Window Slider' })).toBeVisible();

    const photographs = page.getByTestId('sub-assembly-photographs');
    const editor = photographs.getByTestId('photograph-editor');
    await editor.locator('input[type="file"]').setInputFiles([
      { name: 'slider.webp', mimeType: 'image/webp', buffer: bytes },
      { name: 'slider-channel.webp', mimeType: 'image/webp', buffer: bytes },
    ]);
    await page.getByRole('button', { name: 'Upload 2' }).click();

    await expect(editor.getByTestId('editable-photograph')).toHaveCount(2);
    await expect(photographs.getByTestId('photograph')).toHaveCount(2);

    // Rendered, not merely requested: these are behind the gate.
    const lead = photographs.getByTestId('photograph').first().locator('img');
    await expect
      .poll(() => lead.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
    const wasLeading = await lead.getAttribute('src');

    await page.getByRole('button', { name: 'Move photograph 2 of 2 earlier' }).click();
    await expect(lead).not.toHaveAttribute('src', wasLeading ?? '');

    await page.reload();
    await expect(lead).not.toHaveAttribute('src', wasLeading ?? '');

    await page.getByRole('button', { name: 'Remove photograph 1 of 2' }).click();
    await expect(editor.getByTestId('editable-photograph')).toHaveCount(1);
    await expect(photographs.getByTestId('photograph')).toHaveCount(1);
    await expect(lead).toHaveAttribute('src', wasLeading ?? '');
  });
});
