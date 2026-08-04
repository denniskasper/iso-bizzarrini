import { expect, type Locator, type Page } from '@playwright/test';
import { signIn } from './gate.js';

/** The Model the practice archive leaves undrawn, which is where a test's own sheet goes. */
const UNDRAWN_MODEL = 'Rivolta IR 300';

/**
 * Getting to a drawing the way a member does: the catalog, then the car, then the plate. Every
 * step goes through the real screens, so a suite cannot pass against a route nobody can reach.
 */
export async function openGrifo(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('link', { name: 'Iso Grifo' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Grifo');
}

/** The scan on screen — the Grifo's first drawing, wherever a test has got to it from. */
export function drawingOf(page: Page): Locator {
  return page.getByRole('img', { name: /Tavola 2/ });
}

/**
 * The circles a number is printed at. **Several, for a number the factory printed several times**
 * — which is the ordinary case and the reason this is not `.first()` here.
 */
export function markFor(page: Page, number: string): Locator {
  return page.locator(`[data-testid="drawing-mark"][data-position="${number}"]`);
}

/**
 * A signed-in member, looking at the Grifo's first drawing — the state most of what this seam
 * exists for begins from.
 */
export async function openFirstDrawing(page: Page): Promise<void> {
  await signIn(page);
  await openGrifo(page);
  await page.getByTestId('tavola-plate').first().click();

  const drawing = drawingOf(page);
  await expect(drawing).toBeVisible();
  await expectTheSheetIsDrawn(drawing);
}

/** Rendered, not merely requested: a 404 image is "visible" too. */
export async function expectTheSheetIsDrawn(drawing: Locator): Promise<void> {
  await expect
    .poll(() => drawing.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
}

/**
 * Circles placed on the sheet the way an Editor places them — **one at a time, each waited for.**
 *
 * The marking tool advances the number in the field when the *archive answers*, not when the
 * click happens: a refused click must not quietly move an Editor's place in the catalog on. So a
 * test that clicks again before the first answer arrives sends the same number twice and gets two
 * circles at one number — which is not what it meant to arrange, and which shows up much later as
 * a strict-mode violation in a test that was not about marking at all.
 *
 * Waiting for each circle is what makes the arrangement mean what it says. It is not papering
 * over a product bug: a real Editor clicking twice inside one round trip gets two circles at one
 * number, and that is `held`'s behaviour arrived at by accident rather than by asking — worth its
 * own ticket, and deliberately not decided here.
 *
 * The tool has to be on already. Points are fractions of the frame, as everything on a scan is.
 */
export async function placeMarks(
  page: Page,
  points: { x: number; y: number; number?: string }[],
): Promise<void> {
  const frame = page.getByTestId('drawing-frame');
  const box = await frame.boundingBox();
  if (!box) {
    throw new Error('The drawing has no frame.');
  }

  const already = await page.getByTestId('drawing-mark').count();
  for (const [index, point] of points.entries()) {
    if (point.number !== undefined) {
      await page.getByTestId('next-number').fill(point.number);
    }
    await frame.click({ position: { x: box.width * point.x, y: box.height * point.y } });
    await expect(page.getByTestId('drawing-mark')).toHaveCount(already + index + 1);
  }
}

/**
 * Image bytes to upload, **borrowed from the archive rather than committed to this repository.**
 *
 * There is no real image in this repository and there should not be (`AGENTS.md`), and a test
 * that needs one to upload has to get it from somewhere. The practice archive's own drawing is
 * that somewhere: it is invented, it is already there, and reading it back out and sending it up
 * again is a real ingest of a real file.
 *
 * The **thumbnail** rather than the full sheet, because every one of these uploads is a real
 * ingest and this suite runs its files in parallel: a dozen full-size images being re-encoded
 * takes the machine away from the browsers, and nothing here is about how large a picture is.
 */
export async function borrowAnImage(page: Page): Promise<Buffer> {
  const models = (await (await page.request.get('/api/models')).json()) as {
    models: { id: string; name: string }[];
  };
  const grifo = models.models.find((candidate) => candidate.name === 'Grifo');
  if (!grifo) {
    throw new Error('The practice archive has no Model named Grifo.');
  }

  const listed = (await (await page.request.get(`/api/models/${grifo.id}`)).json()) as {
    tavole: { scan: { previewUrl: string } | null }[];
  };
  const drawn = listed.tavole.find((tavola) => tavola.scan !== null);
  if (!drawn?.scan) {
    throw new Error('The practice archive has no image to borrow.');
  }
  return (await page.request.get(drawn.scan.previewUrl)).body();
}

/**
 * A drawing of this test's own, opened and ready to be marked up.
 *
 * **Tests that write need a sheet nobody else is writing on.** This suite runs its files in
 * parallel and every one of them twice — once on a desktop and once on a phone — so two runs of
 * the same test would otherwise be placing circles on each other's Tavola and counting them.
 *
 * The sheet is put on the one Model the practice archive leaves undrawn, so nothing that counts
 * what a *drawn* Model has is disturbed; and it is given a picture borrowed out of the archive
 * itself — see `borrowAnImage` for why nothing is committed here to get one.
 */
export async function openADrawingOfYourOwn(page: Page, named: string): Promise<Locator> {
  await signIn(page);

  const models = (await (await page.request.get('/api/models')).json()) as {
    models: { id: string; name: string }[];
  };
  const model = (name: string) => {
    const found = models.models.find((candidate) => candidate.name === name);
    if (!found) {
      throw new Error(`The practice archive has no Model named ${name}.`);
    }
    return found;
  };

  const sheet = await borrowAnImage(page);

  const created = (await (
    await page.request.post(`/api/models/${model(UNDRAWN_MODEL).id}/tavole`, {
      data: {
        number: named,
        nameIt: 'Foglio di prova',
        nameEn: 'Practice sheet',
        category: 'Brakes',
        catalogSection: '',
        catalogGroup: '',
        catalogSubgroup: '',
      },
    })
  ).json()) as { tavola: { id: string } };

  await page.request.put(`/api/tavole/${created.tavola.id}/scan`, {
    headers: { 'Content-Type': 'image/webp' },
    data: sheet,
  });

  await page.goto(`/tavole/${created.tavola.id}`);
  const drawing = page.getByRole('img', { name: new RegExp(`Tavola ${named} `) });
  await expect(drawing).toBeVisible();
  await expectTheSheetIsDrawn(drawing);
  return drawing;
}
