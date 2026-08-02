import sharp, { type Metadata, type Sharp } from 'sharp';
import { UnsupportedMediaTypeError } from '../http/errors.js';
import { isSupportedImageFormat, type ImageFormat } from './scan-formats.js';

/**
 * Turning what an Editor uploaded into something a member can read — the whole of story 94,
 * "the scan prepared automatically on upload, so I do not have to think about image formats".
 *
 * Two derived images come out, and the upload itself is kept untouched:
 *
 * - **display** — the whole drawing, **losslessly** re-encoded as WebP. Lossy encoding is the
 *   obvious choice for a photograph and the wrong one here: the archive's entire value is that
 *   a sixty-year-old position number stays readable, and the numbers are the smallest, highest
 *   contrast marks on the sheet — exactly what a quality slider eats first. It also happens to
 *   be smaller: on the one genuine drawing available, lossless WebP came out 18% under the
 *   source PNG and 17% under the same image at quality 82. Byte sizes are recorded for every
 *   scan, so if a real greyscale archive disagrees, it will say so rather than be argued about.
 * - **preview** — a thumbnail, so listing a Model's Tavole does not download its drawings.
 *
 * No tile pyramid. That decision, and the measurement it waits on, are in ADR 0013.
 */

/** WebP cannot store an edge beyond 16383px, and an A3 sheet at 600 dpi is 9921px. */
const MAX_DISPLAY_EDGE = 10_000;

/** Wide enough to recognise a drawing in a list on a phone, small enough to send fifty of them. */
const PREVIEW_WIDTH = 480;

export interface PreparedImage {
  contents: Buffer;
  byteSize: number;
  width: number;
  height: number;
}

export interface PreparedScan {
  source: {
    /** What the bytes turned out to be — never what the upload claimed or was named. */
    format: ImageFormat;
    byteSize: number;
    width: number;
    height: number;
  };
  display: PreparedImage & { format: 'webp' };
  preview: PreparedImage & { format: 'webp' };
}

export async function prepareScan(upload: Buffer): Promise<PreparedScan> {
  // `autoOrient` so a scan photographed on a phone is stored the way up it was taken, and every
  // dimension reported below is the dimension a member actually sees.
  const source = sharp(upload, { autoOrient: true });
  const metadata = await readMetadata(source);

  const [display, preview] = await Promise.all([
    render(
      source
        .clone()
        .resize({
          width: MAX_DISPLAY_EDGE,
          height: MAX_DISPLAY_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ lossless: true }),
    ),
    render(
      source
        .clone()
        .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
        .webp({ quality: 78 }),
    ),
  ]);

  return {
    source: {
      format: metadata.format,
      byteSize: upload.byteLength,
      width: metadata.width,
      height: metadata.height,
    },
    display: { ...display, format: 'webp' },
    preview: { ...preview, format: 'webp' },
  };
}

async function readMetadata(
  image: Sharp,
): Promise<{ format: ImageFormat; width: number; height: number }> {
  let metadata: Metadata;
  try {
    metadata = await image.metadata();
  } catch {
    throw new UnsupportedMediaTypeError(
      'That file could not be read as an image. A scan should be a PNG, JPEG or TIFF.',
    );
  }

  const { format, width, height } = metadata;
  if (!isSupportedImageFormat(format)) {
    throw new UnsupportedMediaTypeError(
      `A scan cannot be stored as ${format ?? 'that format'}. Upload a PNG, JPEG or TIFF.`,
    );
  }
  if (width === undefined || height === undefined || width < 1 || height < 1) {
    throw new UnsupportedMediaTypeError('That image has no readable dimensions.');
  }

  return { format, width, height };
}

async function render(pipeline: Sharp): Promise<PreparedImage> {
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { contents: data, byteSize: data.byteLength, width: info.width, height: info.height };
}
