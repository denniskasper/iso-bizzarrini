/**
 * Which image formats this archive will read, and what each one is called over HTTP.
 *
 * **One list, not two.** Written twice, the pair drifts silently and in the worst direction:
 * ingest accepts a format the serving side has never heard of, so the scan is stored, the
 * Tavola looks finished, and the drawing arrives as `application/octet-stream` for a browser
 * to download rather than draw.
 *
 * The keys are the names libvips reports, not file extensions and not what an upload claimed
 * about itself — what a file *is* is decided by reading it.
 */
export const IMAGE_CONTENT_TYPES = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  tiff: 'image/tiff',
  webp: 'image/webp',
  avif: 'image/avif',
  heif: 'image/heif',
} as const satisfies Record<string, string>;

export type ImageFormat = keyof typeof IMAGE_CONTENT_TYPES;

export function isSupportedImageFormat(format: string | undefined): format is ImageFormat {
  return format !== undefined && format in IMAGE_CONTENT_TYPES;
}

/** What a scanner, a phone or the club's archive software plausibly produces. */
export const ACCEPTED_UPLOAD_TYPES = [
  ...new Set(Object.values(IMAGE_CONTENT_TYPES)),
] as readonly string[];
