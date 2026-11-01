import { expect, test, type Page } from '@playwright/test';

/**
 * **A practice system's icons can never pass for the archive's** (ADR 0020, issue #207). The
 * archive wears the Club's emblem on a home screen; Integration and Development wear Ricambi's
 * roundel in their band's colour, on every icon, and the emblem nowhere.
 *
 * This seam serves a practice system. The other two are read off the same server with the
 * document stamped as Production's server, or `vite dev`, would have stamped it.
 */
async function stamp(page: Page, restamp: (html: string) => string) {
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') {
      return route.continue();
    }
    const response = await route.fetch();
    return route.fulfill({ response, body: restamp(await response.text()) });
  });
}

/** Every icon the page links to, its manifest's included, each checked to be served. */
async function linkedIcons(page: Page): Promise<string[]> {
  const links = await page
    .locator('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('href') ?? ''));
  expect(links).toHaveLength(4);

  const manifestHref = links.find((href) => href.endsWith('.webmanifest'));
  expect(manifestHref).toBeDefined();
  const manifest = await page.request.get(manifestHref!);
  expect(manifest.ok()).toBe(true);
  const { icons } = (await manifest.json()) as { icons: { src: string; sizes: string }[] };
  expect(icons.map((icon) => icon.sizes).sort()).toEqual(['192x192', '512x512']);

  const all = [...links, ...icons.map((icon) => icon.src)];
  for (const href of all) {
    const response = await page.request.get(href);
    expect(response.ok(), `${href} is served`).toBe(true);
  }
  return all;
}

test.describe('the icons', () => {
  test('of Integration are its tinted roundel, and never the emblem', async ({ page }) => {
    await page.goto('/');

    const icons = await linkedIcons(page);
    for (const href of icons) {
      expect(href).toMatch(/^\/practice\/integration\//);
    }
  });

  test('of Development are its own tinted roundel, and never the emblem', async ({ page }) => {
    await stamp(page, (html) =>
      html.replace(/<html\b([^>]*)>/i, '<html$1 data-environment-system="development">'),
    );
    await page.goto('/');

    const icons = await linkedIcons(page);
    for (const href of icons) {
      expect(href).toMatch(/^\/practice\/development\//);
    }
  });

  test("of the archive are the off-white roundel and the Club's emblem", async ({ page }) => {
    await stamp(page, (html) =>
      html.replace('data-environment-mode="non-production"', 'data-environment-mode="production"'),
    );
    await page.goto('/');

    const icons = await linkedIcons(page);
    expect(icons.sort()).toEqual([
      '/apple-touch-icon.png',
      '/favicon.ico',
      '/favicon.svg',
      '/icon-192.png',
      '/icon-512.png',
      '/manifest.webmanifest',
    ]);
  });
});
