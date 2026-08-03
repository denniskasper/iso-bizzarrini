import { expect, type Locator, type Page } from '@playwright/test';
import { signIn } from './gate.js';

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
 * A signed-in member, looking at the Grifo's first drawing — the state most of what this seam
 * exists for begins from.
 */
export async function openFirstDrawing(page: Page): Promise<void> {
  await signIn(page);
  await openGrifo(page);
  await page.getByTestId('tavola-plate').first().click();

  const drawing = drawingOf(page);
  await expect(drawing).toBeVisible();
  // Rendered, not merely requested: a 404 image is "visible" too.
  await expect
    .poll(() => drawing.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
}
