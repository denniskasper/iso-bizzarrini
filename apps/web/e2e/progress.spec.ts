import { expect, test, type Page } from '@playwright/test';
import { markFor, openADrawingOfYourOwn, openFirstDrawing, openGrifo } from './support/archive.js';
import { signIn } from './support/gate.js';

/**
 * Where the work stands, on the screen.
 *
 * The API seam already proves the counting. **Only a browser can say what an Editor coming back
 * to a half-marked sheet actually sees**: whether the numbers that still need something are
 * findable without clicking every circle, and — the one thing no response body contains —
 * whether the drawing itself can be made to distinguish them.
 *
 * The practice archive's first Grifo sheet is exactly the state this ticket is about: five
 * numbers, four circled, four listed, with `5` carrying no circle and `4` carrying no Part. One
 * of each, deliberately, from ticket 05 and ticket 06.
 */
test.describe('what is left on one sheet', () => {
  test('says how many numbers there are, and how many carry a Mark and a Listing', async ({
    page,
  }) => {
    await openFirstDrawing(page);

    const progress = page.getByTestId('sheet-progress');
    await expect(progress.getByTestId('count-positions')).toHaveText('5');
    await expect(progress.getByTestId('count-marked')).toHaveText('4 / 5');
    await expect(progress.getByTestId('count-listed')).toHaveText('4 / 5');
  });

  /**
   * The two gaps are **two separate lists**, because they are two different evenings' work and a
   * number in one is very often finished in the other. `5` is the number the factory listed and
   * did not draw; `4` is the circle nobody has recorded a Part at yet.
   */
  test('lists the numbers with no circle apart from the numbers with nothing recorded', async ({
    page,
  }) => {
    await openFirstDrawing(page);

    // By the attribute rather than the text: a number with no circle also carries "listed but
    // not drawn" for a screen reader, which is the chip saying the same thing in the other sense.
    const noCircle = page.getByTestId('no-circle').getByTestId('no-circle-position');
    await expect(noCircle).toHaveCount(1);
    await expect(noCircle).toHaveAttribute('data-position', '5');

    const nothingRecorded = page
      .getByTestId('nothing-recorded')
      .getByTestId('nothing-recorded-position');
    await expect(nothingRecorded).toHaveCount(1);
    await expect(nothingRecorded).toHaveAttribute('data-position', '4');
  });

  /** A number reached from the tally is read like any other number in the text. */
  test('takes the drawing to a number an Editor picks out of it', async ({ page }) => {
    await openFirstDrawing(page);

    await page.getByTestId('nothing-recorded').getByTestId('nothing-recorded-position').click();

    await expect(page.getByTestId('selected-position')).toHaveText('4');
    await expect(page).toHaveURL(/position=4/);
  });

  /**
   * **The headline, and the half of it a drawing can carry.** A Position with no Mark has nothing
   * on the sheet to distinguish — there is no circle to light — so what the drawing can be made
   * to say is which of its circles have nothing recorded at them, by receding the rest. The
   * numbers that are on no circle at all are named in the panel instead, which is why the two
   * lists above are not one.
   */
  test('lights the numbers with nothing recorded on the drawing itself', async ({ page }) => {
    await openFirstDrawing(page);

    // Until it is asked for, the sheet is a sheet.
    await expect(page.locator('[data-testid="drawing-mark"][data-subdued="true"]')).toHaveCount(0);

    await page.getByTestId('show-gaps').click();

    // `4` has no Part recorded at it and stays lit; everything the archive has answered recedes.
    await expect(markFor(page, '4')).toHaveAttribute('data-subdued', 'false');
    await expect(markFor(page, '1')).toHaveAttribute('data-subdued', 'true');
    await expect(markFor(page, '2').first()).toHaveAttribute('data-subdued', 'true');
    await expect(markFor(page, '3')).toHaveAttribute('data-subdued', 'true');

    // And it stops, because an Editor asked a question rather than changed the sheet.
    await page.getByTestId('show-gaps').click();
    await expect(page.locator('[data-testid="drawing-mark"][data-subdued="true"]')).toHaveCount(0);
  });

  /**
   * **The drawing answers one question at a time.** Showing a Sub-assembly and showing the gaps
   * are the same mechanism, and a sheet lighting both at once would be bright circles meaning two
   * different things. `1` is in the *Front caliper assembly* and has a Part recorded at it, so it
   * is lit by one question and receded by the other — which is what makes it the number worth
   * asserting on.
   */
  test('stops showing a Sub-assembly when the gaps are asked for instead', async ({ page }) => {
    await openFirstDrawing(page);

    await markFor(page, '1').first().click();
    await page.getByTestId('show-sub-assembly').click();
    await expect(markFor(page, '1')).toHaveAttribute('data-subdued', 'false');

    await page.getByTestId('show-gaps').click();

    await expect(page.getByTestId('show-sub-assembly')).toHaveAttribute('aria-pressed', 'false');
    await expect(markFor(page, '1')).toHaveAttribute('data-subdued', 'true');
    await expect(markFor(page, '4')).toHaveAttribute('data-subdued', 'false');
  });

  /**
   * **The switch is inside the list of gaps, so filling the last one takes it off the screen** —
   * and a sheet that went on receding every circle with nothing left to press would be an Editor
   * locked out of their own drawing by finishing it. Only a browser can catch this: the whole
   * failure is a control unmounting while the state it set stays behind.
   */
  test('gives the whole sheet back when the last gap is filled from under the switch', async ({
    page,
  }, info) => {
    const frame = page.getByTestId('drawing-frame');

    await openADrawingOfYourOwn(page, `gaps-${info.project.name}`);
    const box = await frame.boundingBox();
    if (!box) {
      throw new Error('The drawing has no frame.');
    }

    // Two numbers, placed the way an Editor places them, and a Part at the first.
    await page.getByRole('button', { name: 'Mark positions' }).click();
    await frame.click({ position: { x: box.width * 0.3, y: box.height * 0.3 } });
    await frame.click({ position: { x: box.width * 0.7, y: box.height * 0.6 } });
    await page.getByRole('button', { name: 'Done' }).click();
    await recordAPartAt(page, '1', 'Throttle return spring');

    // So `2` is the sheet's one gap, and asking for it recedes `1`.
    await page.getByTestId('show-gaps').click();
    await expect(markFor(page, '2')).toHaveAttribute('data-subdued', 'false');
    await expect(markFor(page, '1')).toHaveAttribute('data-subdued', 'true');

    await recordAPartAt(page, '2', 'Throttle return spring bracket');

    // Nothing is left to ask about, so nothing is receding and the sheet is a sheet again.
    await expect(page.getByTestId('show-gaps')).toHaveCount(0);
    await expect(page.getByTestId('sheet-progress')).toContainText(
      'Every number on this sheet carries a circle and a Part.',
    );
    await expect(page.locator('[data-testid="drawing-mark"][data-subdued="true"]')).toHaveCount(0);
  });

  /**
   * **Casually is the word the ticket uses, and it is the whole requirement**: a Tavola may carry
   * over two hundred numbers, and a panel an Editor hesitates to open is a panel that does not
   * get opened.
   *
   * What makes it free is that it asks the archive nothing — the sheet arrives with the drawing
   * and the index arrives for the list beside it, and this is one pass over both. So the thing
   * asserted is exactly that: **two hundred numbers, and not one request more than the sheet
   * costs without this panel on it.**
   */
  test('opens on a sheet of two hundred numbers without asking the archive anything', async ({
    page,
  }, info) => {
    const drawing = await openADrawingOfYourOwn(page, `two-hundred-${info.project.name}`);
    const tavolaId = /\/tavole\/([^/?]+)/.exec(page.url())?.[1];
    if (!tavolaId) {
      throw new Error('The drawing has no address to record numbers against.');
    }

    // Recorded through the API rather than by clicking two hundred times: what is under test is
    // the panel opening, not the marking tool, which ticket 05's own suite covers.
    const numbers = Array.from({ length: 200 }, (_, at) => String(at + 1));
    await Promise.all(
      numbers.map((number) =>
        page.request.post(`/api/tavole/${tavolaId}/positions`, { data: { number } }),
      ),
    );

    const asked: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/')) {
        asked.push(request.url());
      }
    });

    await page.reload();
    await expect(drawing).toBeVisible();

    const progress = page.getByTestId('sheet-progress');
    await expect(progress.getByTestId('count-positions')).toHaveText('200');
    await expect(progress.getByTestId('count-marked')).toHaveText('0 / 200');
    // Every one of them is named, rather than the first few and a count of the rest: this list is
    // what the work is done from.
    await expect(progress.getByTestId('no-circle-position')).toHaveCount(200);

    // The sheet, its index, and the session the shell asks for. Nothing this panel added.
    expect(asked.filter((url) => url.includes('/listings'))).toHaveLength(1);
    expect(asked.filter((url) => url.includes('progress'))).toHaveLength(0);
  });
});

/** A Part recorded at a number the way an Editor records one, from the panel under the drawing. */
async function recordAPartAt(page: Page, number: string, nameEn: string): Promise<void> {
  await page.locator(`[data-testid="drawing-mark"][data-position="${number}"]`).click();
  await page.getByRole('button', { name: 'Record a part here' }).click();
  await page.getByLabel('Name (English)').fill(nameEn);
  await page.getByRole('button', { name: 'Record this part' }).click();
  await expect(page.getByTestId('part-reading')).toContainText(nameEn);
}

/**
 * And across a whole car, which is what decides where an evening goes. The Grifo's three sheets
 * are in three different states: one nearly done, one marked and barely listed, and one nobody
 * has drawn at all.
 */
test.describe('where the work stands across a car', () => {
  test('counts every drawing of the car, in the catalog’s own order', async ({ page }) => {
    await signIn(page);
    await openGrifo(page);

    const rows = page.getByTestId('model-progress-row');
    await expect(rows).toHaveCount(3);

    // 2, 10, 12 bis — never 10, 12 bis, 2, which is what sorting the strings would print.
    await expect(rows.nth(0)).toHaveAttribute('data-tavola', '2');
    await expect(rows.nth(1)).toHaveAttribute('data-tavola', '10');
    await expect(rows.nth(2)).toHaveAttribute('data-tavola', '12 bis');
  });

  test('tells a sheet that is nearly done from one that is barely started', async ({ page }) => {
    await signIn(page);
    await openGrifo(page);

    const rows = page.getByTestId('model-progress-row');

    await expect(rows.nth(0).getByTestId('row-marked')).toHaveText('4 / 5');
    await expect(rows.nth(0).getByTestId('row-listed')).toHaveText('4 / 5');
    await expect(rows.nth(1).getByTestId('row-listed')).toHaveText('1 / 5');
  });

  /**
   * A Tavola recorded from a paper catalog before anybody has scanned the sheet has no numbers on
   * it at all. **A dash, and not a nought out of nought** — an empty fraction reads as "none of it
   * done" about a drawing nobody has opened, which is a different thing.
   */
  test('says nothing rather than none about a drawing nobody has marked up', async ({ page }) => {
    await signIn(page);
    await openGrifo(page);

    const untouched = page.getByTestId('model-progress-row').nth(2);
    await expect(untouched.getByTestId('row-marked')).toHaveText('—');
    await expect(untouched.getByTestId('row-listed')).toHaveText('—');
  });

  /** Reading the tally is how an Editor chooses a sheet, so every line of it is a way in. */
  test('opens the drawing an Editor picks off it', async ({ page }) => {
    await signIn(page);
    await openGrifo(page);

    await page.getByTestId('model-progress-row').nth(1).getByRole('link', { name: '10' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Impianto elettrico');
  });
});
