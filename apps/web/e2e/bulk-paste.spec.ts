import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openADrawingOfYourOwn } from './support/archive.js';

/**
 * Pasting a whole catalog page, and taking one back out (stories 113–114).
 *
 * What is asserted here is what a request and a response cannot say. The API seam already proves
 * that a preview writes nothing and that an exported sheet pastes back clean; only a browser can
 * say that **an Editor is shown the consequences and has to look at them before anything can be
 * recorded** — that there is no press on the screen that writes until a plan has been on it.
 *
 * The sheet is one of this test's own, because this suite runs its files in parallel and twice
 * over, and a paste is the least neighbourly thing an Editor can do to a drawing.
 */

/** The header the archive writes, tab-separated exactly as a spreadsheet puts it on a clipboard. */
const HEADER = ['Position', 'Catalog Number', 'Name (English)', 'Quantity', 'Drawn'].join('\t');

function paste(page: Page, ...rows: string[]) {
  return page.getByLabel('The rows').fill([HEADER, ...rows].join('\n'));
}

/**
 * A Catalog Number nobody else in this run will type.
 *
 * **A Catalog Number is unique across the whole archive** (ADR 0001), and this suite runs every
 * file twice — once on a desktop and once on a phone — against one archive. A number written
 * literally here would be two runs racing for it, and the loser is refused exactly as the archive
 * promises: nothing written, read it again. Which is the archive being right and the test being
 * careless.
 */
function aNumber(project: string, tail: string): string {
  return `260 ${project.slice(0, 2).toUpperCase()} ${tail}`;
}

/** The sheet's own index, beside the drawing — one line a number, and what is recorded at it. */
function numbersOn(page: Page) {
  return page.getByTestId('sheet-line');
}

test.describe('a whole page at once', () => {
  test('shows what a paste will do before it will record any of it', async ({ page }, info) => {
    await openADrawingOfYourOwn(page, `paste-${info.project.name}`);

    await paste(
      page,
      ['207', aNumber(info.project.name, '100'), 'Window channel guide rod', '2', 'yes'].join('\t'),
      ['207', '', 'Retaining washer', '4', 'no'].join('\t'),
      ['208', aNumber(info.project.name, '101'), 'Window channel', '1', 'yes'].join('\t'),
    );

    // **The only action on the panel writes nothing**, which is the whole guarantee: there is no
    // way to reach the archive from here without having read what it is about to do.
    await expect(page.getByRole('button', { name: /Record/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Show me what this will do' }).click();

    // What it made of the Editor's own columns, before what it made of their rows — a column read
    // as the wrong field is a mistake that is otherwise found two hundred rows later.
    const panel = page.getByRole('region', { name: 'A whole page at once' });
    await expect(panel).toContainText('Read from your columns');
    await expect(panel).toContainText('not in your sheet');
    await expect(panel).toContainText('Window channel guide rod');
    await expect(panel).toContainText('New part');

    // And the sheet itself has gained nothing. The drawing and its own index are on the same
    // screen as the plan that would fill them, which is why this is worth asserting here.
    await expect(numbersOn(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Record 3 rows' }).click();

    await expect(page.getByTestId('paste-recorded')).toContainText('3 rows recorded');
    // Two numbers, because two of the three rows are at 207 — a bracket and the washer that
    // fastens it. Both re-read without the Editor reloading anything.
    await expect(numbersOn(page)).toHaveCount(2);
    await expect(page.getByTestId('sheet-parts')).toContainText('Window channel guide rod');
  });

  test('reports a row it cannot read with its line, and records the rest', async ({
    page,
  }, info) => {
    await openADrawingOfYourOwn(page, `paste-refused-${info.project.name}`);

    await paste(
      page,
      ['301', '', 'Bracket', '1', 'yes'].join('\t'),
      ['302', '', 'Spacer', 'two', 'yes'].join('\t'),
      ['303', '', 'Shim', '1', 'yes'].join('\t'),
    );
    await page.getByRole('button', { name: 'Show me what this will do' }).click();

    const refused = page.getByRole('row').filter({ hasText: 'Not read' });
    await expect(refused).toContainText('two');
    // The line of the Editor's own spreadsheet, counting the header as line 1 — the only address
    // they have for the row they have to go and fix.
    await expect(refused.locator('td').first()).toHaveText('3');

    // The two that can be read are not held up by the one that cannot.
    await page.getByRole('button', { name: 'Record 2 rows' }).click();
    await expect(page.getByTestId('paste-recorded')).toContainText('2 rows recorded');
    await expect(numbersOn(page)).toHaveCount(2);
  });

  /**
   * **"What will be matched to an existing Part" has to name the Part.** A row reading only
   * *Matched* asks an Editor to take the archive's word for which component it picked, on the one
   * screen where that judgement is theirs — and whether the name is actually on the screen is not
   * something a response body can say.
   */
  test('names the Part a row will be matched to, rather than only saying it matched', async ({
    page,
  }, info) => {
    await openADrawingOfYourOwn(page, `paste-matched-${info.project.name}`);

    const rod = aNumber(info.project.name, '500');
    await paste(page, ['501', rod, 'Window channel guide rod', '2', 'yes'].join('\t'));
    await page.getByRole('button', { name: 'Show me what this will do' }).click();
    await page.getByRole('button', { name: 'Record 1 row' }).click();
    await expect(page.getByTestId('paste-recorded')).toBeVisible();
    await page.getByRole('button', { name: 'Paste another page' }).click();

    // The same part, at a second number — one part on two lines of a catalog page, which is what
    // the archive is about to recognise rather than record twice.
    await paste(page, ['502', rod, '', '1', 'yes'].join('\t'));
    await page.getByRole('button', { name: 'Show me what this will do' }).click();

    const matched = page.getByRole('row').filter({ hasText: 'Matched' });
    await expect(matched).toContainText('Window channel guide rod');
    await expect(matched).toContainText(rod);
  });

  test('offers the drawing back as a spreadsheet', async ({ page }, info) => {
    await openADrawingOfYourOwn(page, `paste-export-${info.project.name}`);

    const plate = aNumber(info.project.name, '404');
    await paste(page, ['404', plate, 'Data plate', '1', 'yes'].join('\t'));
    await page.getByRole('button', { name: 'Show me what this will do' }).click();
    await page.getByRole('button', { name: 'Record 1 row' }).click();
    await expect(page.getByTestId('paste-recorded')).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Export this drawing' }).click();

    const file = await download;
    // Named for the drawing, because an Editor with a folder of these is looking for one sheet.
    expect(file.suggestedFilename()).toContain('practice-sheet');

    const csv = await readFile(await file.path(), 'utf8');
    expect(csv).toContain('Catalog Number');
    expect(csv).toContain(plate);
  });
});
