import sharp from 'sharp';
import type { PreparedImage } from './image-ingest.js';

/**
 * **A Sample's public copy of its drawing** (ADR 0019): sharp enough for a Visitor to read every
 * number on the sheet, and not enough to print the sheet from.
 *
 * Made from the Scan's display image rather than from the upload, because that is the drawing the
 * Marks are placed on: a sheet an Editor has turned upright is copied upright, with nothing to
 * work out twice.
 *
 * **2000px on the long edge.** An A3 sheet is 420mm across, so that is close to five pixels a
 * millimetre: a printed position number a few millimetres high is still a dozen pixels or more on
 * screen, and the whole sheet is under 125 dpi, which no restorer would print from. Never
 * enlarged, so a small scan is copied at its own size.
 *
 * **Lossy, where the Scan is not.** The Scan is lossless because it is the archive's copy and a
 * number must survive it untouched (`scan-ingest.ts`); this one is a picture of the archive for
 * strangers, and the smaller it is the less of the archive it is.
 */
const LONG_EDGE = 2000;

export async function prepareSampleDrawing(display: Buffer): Promise<PreparedImage> {
  const { data, info } = await sharp(display)
    .resize({ width: LONG_EDGE, height: LONG_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  return { contents: data, byteSize: data.byteLength, width: info.width, height: info.height };
}
