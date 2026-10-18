import { prepareImage, type ImageRecipe, type PreparedUpload } from './image-ingest.js';

/**
 * What a Tavola's scan wants doing to it — the whole of story 94, "the scan prepared
 * automatically on upload, so I do not have to think about image formats".
 *
 * **Lossless, and it is worth saying why.** Lossy encoding is the obvious choice for a photograph
 * and the wrong one here: the archive's entire value is that a sixty-year-old position number
 * stays readable, and the numbers are the smallest, highest-contrast marks on the sheet — exactly
 * what a quality slider eats first. It also happens to be smaller: on the one genuine drawing
 * available, lossless WebP came out 18% under the source PNG and 17% under the same image at
 * quality 82. Byte sizes are recorded for every scan, so if a real greyscale archive disagrees,
 * it will say so rather than be argued about.
 *
 * No tile pyramid. That decision, and the measurement it waits on, are in ADR 0013.
 */

/** WebP cannot store an edge beyond 16383px, and an A3 sheet at 600 dpi is 9921px. */
const MAX_DISPLAY_EDGE = 10_000;

const SCAN: ImageRecipe = {
  noun: 'scan',
  displayMaxEdge: MAX_DISPLAY_EDGE,
  encodeDisplay: (pipeline) => pipeline.webp({ lossless: true }),
};

/** `quarterTurns` clockwise, for a sheet an Editor has turned upright (issue #34). */
export function prepareScan(upload: Buffer, quarterTurns = 0): Promise<PreparedUpload> {
  return prepareImage(upload, SCAN, quarterTurns);
}
