import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { landed, PRACTICE, signIn, signInAs } from './support/gate.js';

test.describe('the application shell', () => {
  test('serves the app for a deep link, so a shared address survives a reload', async ({
    page,
  }) => {
    // Nothing lives here, but the *archive* must answer — not the web server.
    const response = await page.goto('/tavola/207');

    expect(response?.status()).toBe(200);
    // Signed out, even an address that does not exist is answered by the gate rather than by a
    // page saying what is not there. A stranger learns nothing about the archive's shape.
    await expect(page.getByRole('heading', { name: 'The archive is members-only.' })).toBeVisible();
  });

  test('says plainly when a signed-in member follows an address that leads nowhere', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/tavola/207');

    await expect(page.getByRole('heading', { name: 'There is nothing here.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to the catalog' })).toBeVisible();
  });

  test.describe('the theme', () => {
    test.use({ colorScheme: 'dark' });

    test('is graphite when nothing says otherwise, so the drawing is the brightest thing on screen', async ({
      page,
    }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveClass(/dark/);
    });

    test('remembers an explicit choice, so nobody re-picks it every visit', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Switch to the light theme' }).click();
      await expect(page.locator('html')).not.toHaveClass(/dark/);

      await page.reload();
      await expect(page.locator('html')).not.toHaveClass(/dark/);
    });
  });

  test.describe('a browser asking for light', () => {
    test.use({ colorScheme: 'light' });

    test('is answered with paper, because a stated preference outranks our default', async ({
      page,
    }) => {
      await page.goto('/');
      await expect(page.locator('html')).not.toHaveClass(/dark/);
    });
  });

  /**
   * **Whose archive this is** (issue #209, ADR 0020): the Club's own wordmark, white on the
   * graphite header as on the Club website, with "Ricambi" beside it. The logo ships with the
   * app, so this system, with nothing mounted, shows it as every other one does.
   */
  test.describe('the header', () => {
    const CLUB_NAME = 'ISO Bizzarrini Club Deutschland e.V.';

    test("shows the Club's wordmark with Ricambi beside it, named for the Club", async ({
      page,
    }) => {
      await page.goto('/');

      const header = page.getByRole('banner');
      const logo = header.getByRole('img', { name: CLUB_NAME, exact: true });
      await expect(logo).toBeVisible();
      // Loaded, not a broken image with its alternative text standing in.
      expect(
        await logo.evaluate((image) => (image as HTMLImageElement).naturalWidth),
      ).toBeGreaterThan(0);
      const home = header.getByRole('link', { name: `${CLUB_NAME} Ricambi`, exact: true });
      await expect(home).toBeVisible();
      await expect(home).toHaveAttribute('href', '/');
      await expect(home).toContainText('Ricambi');
    });

    test('is graphite whichever theme the page wears, so the white wordmark always reads', async ({
      page,
    }) => {
      await page.goto('/');
      const header = page.getByRole('banner');
      const graphite = await header.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );

      await page.getByRole('button', { name: /Switch to the/ }).click();
      await expect(header).toHaveCSS('background-color', graphite);
    });

    test("keeps a member's header on one line, scaling the wordmark down rather than wrapping", async ({
      page,
    }) => {
      await signInAs(page, PRACTICE.member);
      await landed(page);

      const header = page.getByRole('banner');
      const home = header.getByRole('link', { name: `${CLUB_NAME} Ricambi` });
      const theme = header.getByRole('button', { name: /Switch to the/ });
      const [homeBox, themeBox] = await Promise.all([home.boundingBox(), theme.boundingBox()]);
      expect(homeBox).not.toBeNull();
      expect(themeBox).not.toBeNull();
      // One row: the last control sits level with the home link, not on a line of its own.
      expect(Math.abs(homeBox!.y - themeBox!.y)).toBeLessThan(homeBox!.height);
      expect(
        await header.evaluate((element) => (element as HTMLElement).offsetHeight),
      ).toBeLessThan(80);
      // Scaled down, and still big enough to read at arm's length.
      const logo = await home.getByRole('img', { name: CLUB_NAME }).boundingBox();
      expect(logo).not.toBeNull();
      expect(logo!.height).toBeGreaterThanOrEqual(20);
      expect(logo!.width).toBeGreaterThanOrEqual(80);
      // And nothing was pushed past the edge to get there.
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    });

    test("lets an Administrator's header wrap rather than push the page sideways", async ({
      page,
    }) => {
      await signIn(page);

      await expect(page.getByRole('banner').getByRole('link', { name: 'Readings' })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    });
  });

  test('gives every control a target a cold or gloved hand can hit', async ({ page }) => {
    await page.goto('/');

    // Links as well as buttons — the rule is about anything you have to hit, not about roles.
    const controls = await page.getByRole('button').or(page.getByRole('link')).all();
    expect(controls.length).toBeGreaterThan(0);

    for (const control of controls) {
      const name = (await control.getAttribute('aria-label')) ?? (await control.innerText());
      const box = await control.boundingBox();
      expect(box, `"${name}" is laid out`).not.toBeNull();
      expect(box!.height, `"${name}" is tall enough`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `"${name}" is wide enough`).toBeGreaterThanOrEqual(44);
    }
  });

  test('says in the footer which Version is running, signed in or not, on any width', async ({
    page,
  }) => {
    // The one place the Version is written (ADR 0016). This build was told no commit, so the
    // footer reads the Version alone.
    const { version } = JSON.parse(
      await readFile(new URL('../../../package.json', import.meta.url), 'utf8'),
    ) as { version: string };

    for (const signedIn of [false, true]) {
      if (signedIn) {
        await signIn(page);
      }
      await page.goto('/');

      const status = page.getByTestId('service-status');
      await expect(status.locator('dt').first()).toHaveText('Version');
      await expect(status.locator('dd').first()).toHaveText(version);
      // Plain text: nothing to follow, and it pushes nothing off a phone's footer.
      await expect(status.getByRole('link')).toHaveCount(0);
      const privacy = page.getByRole('link', { name: 'Privacy' });
      await privacy.scrollIntoViewIfNeeded();
      await expect(privacy).toBeInViewport({ ratio: 1 });
    }
  });
});
