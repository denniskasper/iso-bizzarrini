import sharp, { type Metadata, type Sharp } from 'sharp';
import { UnsupportedMediaTypeError } from '../http/errors.js';
import { isSupportedImageFormat, type ImageFormat } from './image-formats.js';

/**
 * Turning what somebody uploaded into something a member can look at — **the whole of it, for
 * every picture this archive holds.**
 *
 * Two derived images come out and the upload itself is kept untouched:
 *
 * - **display** — the whole picture, re-encoded as WebP at whatever size and quality the recipe
 *   asks for. This is the one thing a drawing and a photograph genuinely disagree about, and it
 *   is the only thing a recipe gets to decide.
 * - **preview** — a thumbnail, so a list of things never downloads the things.
 *
 * **One implementation and two recipes, rather than two implementations.** Ticket 10 needed the
 * same machinery a scan already had and ticket 19 will need it again for what a Member offers;
 * written a second time, the copies drift in the direction that matters most — one of them
 * accepts a format the serving side has never heard of, or forgets that what a file *is* is
 * decided by reading it rather than by what the request claimed.
 */

/** Wide enough to recognise something in a list on a phone, small enough to send fifty of them. */
const PREVIEW_WIDTH = 480;

/**
 * What one kind of picture wants doing to it, and **the noun a refusal about it uses**.
 *
 * The noun is here rather than at the call site because the refusal is the one part of ingest an
 * Editor ever reads: "a scan cannot be stored as PDF" and "a photograph cannot be stored as PDF"
 * are the same failure and two different sentences, and neither is worth a second code path.
 */
export interface ImageRecipe {
  /** As it appears in a refusal — "scan", "photograph". Lower case; the sentence supplies the rest. */
  noun: string;
  /** The longest edge the display image may have. Never enlarged past what arrived. */
  displayMaxEdge: number;
  /** How the display image is encoded. The one decision a recipe exists to make. */
  encodeDisplay(pipeline: Sharp): Sharp;
}

export interface PreparedImage {
  contents: Buffer;
  byteSize: number;
  width: number;
  height: number;
}

export interface PreparedUpload {
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

export async function prepareImage(upload: Buffer, recipe: ImageRecipe): Promise<PreparedUpload> {
  // `autoOrient` so a sheet or a part photographed on a phone is stored the way up it was taken,
  // and every dimension reported below is the dimension a member actually sees.
  const source = sharp(upload, { autoOrient: true });
  const metadata = await readMetadata(source, recipe.noun);

  const [display, preview] = await Promise.all([
    render(
      recipe.encodeDisplay(
        source.clone().resize({
          width: recipe.displayMaxEdge,
          height: recipe.displayMaxEdge,
          fit: 'inside',
          withoutEnlargement: true,
        }),
      ),
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
  noun: string,
): Promise<{ format: ImageFormat; width: number; height: number }> {
  let metadata: Metadata;
  try {
    metadata = await image.metadata();
  } catch {
    throw new UnsupportedMediaTypeError(
      `That file could not be read as an image. A ${noun} should be a PNG, JPEG or TIFF.`,
    );
  }

  const { format, width, height } = metadata;
  if (!isSupportedImageFormat(format)) {
    throw new UnsupportedMediaTypeError(
      `A ${noun} cannot be stored as ${format ?? 'that format'}. Upload a PNG, JPEG or TIFF.`,
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
