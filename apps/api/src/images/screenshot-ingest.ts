import { prepareImage, type ImageRecipe, type PreparedUpload } from './image-ingest.js';

/**
 * What a screenshot shown with a Proposal wants doing to it (issue #154). **Text on a screen**,
 * so it is kept sharper than a photograph: the words on it are what the developer and the
 * conversation read, and a screen is rarely wider than this.
 */
const SCREENSHOT: ImageRecipe = {
  noun: 'screenshot',
  displayMaxEdge: 2400,
  encodeDisplay: (pipeline) => pipeline.webp({ quality: 90 }),
};

export function prepareScreenshot(upload: Buffer): Promise<PreparedUpload> {
  return prepareImage(upload, SCREENSHOT);
}
