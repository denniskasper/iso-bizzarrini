import { expect, test } from '@playwright/test';
import { forThisAttempt, markFor, openADrawingOfYourOwn } from './support/archive.js';
import { landed, PRACTICE, signIn, signInAs } from './support/gate.js';

/**
 * **A Visitor opening a Sample** (issue #132, ADR 0019): from the landing to the drawing, the open
 * number read, a locked one pressed, and the way in reached. A member at the same address is shown
 * the whole Tavola.
 *
 * What the Visitor's read leaves out is proved at the API seam, Part by Part; what only a browser
 * can say is that the journey is there, and that a club Note never reaches the screen.
 */
test('a Visitor lands, opens a Sample, reads its open number and is led to join', async ({
  page,
}, info) => {
  const named = forThisAttempt(`visit-${info.project.name}`);
  await openADrawingOfYourOwn(page, named);
  const tavolaId = new URL(page.url()).pathname.split('/').at(-1) ?? '';

  // Two numbers and a Part at the first, put there through the archive: the marking tool and the
  // listing panel have their own suites.
  const positions: Record<string, string> = {};
  for (const [number, x] of [
    ['1', 0.3],
    ['2', 0.7],
  ] as const) {
    const placed = (await (
      await page.request.post(`/api/tavole/${tavolaId}/marks`, { data: { number, x, y: 0.5 } })
    ).json()) as { positions: { id: string; number: string }[] };
    positions[number] = placed.positions.find((position) => position.number === number)?.id ?? '';
  }
  const listed = await page.request.post(`/api/tavole/${tavolaId}/listings`, {
    data: {
      positionId: positions['1'],
      quantityPerCar: 2,
      drawn: true,
      part: {
        nameEn: 'Practice caliper',
        nameIt: 'PINZA DI PROVA',
        catalogNumber: '',
        disegnoOrigine: '',
        description: '',
        dimensions: '',
        materialFinish: '',
        catalogNote: 'Fino al telaio di prova',
        note: 'The club’s own note about the practice caliper',
      },
    },
  });
  expect(listed.ok()).toBe(true);
  const shown = await page.request.put(`/api/tavole/${tavolaId}/sample`, {
    data: { positionId: positions['1'] },
  });
  expect(shown.ok()).toBe(true);

  // Now the Visitor's own visit: signed out, from the landing.
  await page.context().clearCookies();
  await page.goto('/');
  await page.getByTestId('landing-sample').filter({ hasText: named }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/tavole/${tavolaId}`);

  const sample = page.getByTestId('visitor-sample');
  await expect(sample.getByRole('img', { name: new RegExp(`Tavola ${named} `) })).toBeVisible();
  await expect(markFor(page, '1')).toHaveCount(1);
  await expect(markFor(page, '2')).toHaveCount(1);

  const reading = page.getByTestId('part-reading');
  await expect(page.getByTestId('selected-position')).toHaveText('1');
  await expect(reading).toContainText('Practice caliper');
  await expect(reading).toContainText('PINZA DI PROVA');
  await expect(reading).toContainText('×2');
  await expect(page.getByTestId('catalog-note')).toContainText('Fino al telaio di prova');
  await expect(page.getByText('The club’s own note')).toHaveCount(0);

  await markFor(page, '2').click();
  const locked = page.getByTestId('locked-number');
  await expect(locked).toContainText('Members see the Parts at every number');
  await expect(page.getByText('Practice caliper')).toHaveCount(0);

  await locked.getByTestId('way-to-join').click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await expect(page.getByRole('heading', { name: 'Ask the Club to join' })).toBeInViewport();

  // A member at the same address reads the whole Tavola, the club's note included.
  await signInAs(page, PRACTICE.member);
  await landed(page);
  await page.goto(`/tavole/${tavolaId}?position=1`);
  await expect(page.getByTestId('club-note')).toContainText('The club’s own note');
  await expect(page.getByTestId('visitor-sample')).toHaveCount(0);

  // Leave the landing as it was found, for the suites that count what it shows.
  await page.context().clearCookies();
  await signIn(page);
  expect((await page.request.delete(`/api/tavole/${tavolaId}/sample`)).ok()).toBe(true);
});

test('a Visitor following a link to a drawing that is not a Sample sees nothing of it', async ({
  page,
}) => {
  await signIn(page);
  const models = (await (await page.request.get('/api/models')).json()) as {
    models: { id: string; name: string }[];
  };
  const grifo = models.models.find((model) => model.name === 'Grifo');
  const listed = (await (await page.request.get(`/api/models/${grifo?.id}`)).json()) as {
    tavole: { id: string; nameIt: string }[];
  };
  const tavola = listed.tavole[0];
  if (!tavola) {
    throw new Error('The practice archive has no Grifo drawing.');
  }
  await page.context().clearCookies();

  await page.goto(`/tavole/${tavola.id}`);

  await expect(page.getByTestId('members-only-tavola')).toContainText(
    'This drawing is for members.',
  );
  await expect(page.getByRole('heading', { name: 'Ask the Club to join' })).toBeVisible();
  await expect(page.getByText(tavola.nameIt)).toHaveCount(0);
  await expect(page.getByTestId('drawing-mark')).toHaveCount(0);
});
