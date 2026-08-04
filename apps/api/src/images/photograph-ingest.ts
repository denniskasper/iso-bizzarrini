import { prepareImage, type ImageRecipe, type PreparedUpload } from './image-ingest.js';

/**
 * What a photograph of a Part wants doing to it — **the opposite of a scan, and deliberately.**
 *
 * A drawing is line art whose smallest marks are the numbers the whole archive turns on, so it is
 * kept lossless (ADR 0013). A photograph of a bracket on a bench is a continuous-tone image with
 * no such marks in it: a quality slider is exactly what lossy encoding was invented for, and
 * keeping one of these lossless would multiply the bytes for a difference nobody looking at a
 * casting can see.
 *
 * The long edge is bounded well below a scan's for the same reason. A member is confirming a
 * *shape* — "is this the one in my hand" — and nothing about that is read at 100%, so a phone in
 * a garage on poor reception is better served by a picture that arrives. The upload itself is
 * kept byte for byte regardless, so the day somebody wants more of it, it is still there.
 */

/** Enough to fill a laptop screen, and about a fifth of the bytes of the phone photograph it came from. */
const MAX_DISPLAY_EDGE = 2400;

/**
 * High enough that a casting's texture and a stamping's edges survive, low enough that a Part
 * carrying six photographs is not a page a member waits for.
 */
const DISPLAY_QUALITY = 82;

const PHOTOGRAPH: ImageRecipe = {
  noun: 'photograph',
  displayMaxEdge: MAX_DISPLAY_EDGE,
  encodeDisplay: (pipeline) => pipeline.webp({ quality: DISPLAY_QUALITY }),
};

export function preparePhotograph(upload: Buffer): Promise<PreparedUpload> {
  return prepareImage(upload, PHOTOGRAPH);
}
