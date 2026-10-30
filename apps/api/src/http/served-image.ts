import type { ReadStream } from 'node:fs';
import type { NextFunction, Request, Response } from 'express';

/**
 * How every image in this archive leaves it — **one answer for a drawing and for a photograph**,
 * because ADR 0006 makes one promise about both and a second copy of these headers is a second
 * chance to make it in only one of them.
 *
 * The whole shape of the answer follows from a single property of the address: it never changes
 * what it points at. A re-upload is a new record and therefore a new URL, so the content can be
 * cached for a year, panning around a drawing re-requests nothing, and the per-request
 * authentication check in front of every image costs nothing worth counting.
 */
export interface StoredImage {
  contentType: string;
  byteSize: number;
  /** The content at this address never changes, so the tag is the address. */
  etag: string;
  stream(): ReadStream;
}

/**
 * A year. **`private` and not `public`**: these are the Club's pictures and belong in one
 * member's browser cache, never in a shared one.
 */
const IMMUTABLE_FOR_A_YEAR = 'private, max-age=31536000, immutable';

/**
 * **A Sample's public copy** (ADR 0019), which a shared cache may keep — but only for an hour.
 * What is at the address never changes, but whether there is anything there does: stopping a
 * Sample deletes its copy, and a year in somebody else's cache would undo that for a year.
 */
const PUBLIC_FOR_AN_HOUR = 'public, max-age=3600';

export function sendImage(
  request: Request,
  response: Response,
  next: NextFunction,
  image: StoredImage,
  /** `public` for a Sample's copy alone: served to anybody, the same to everybody. */
  visibility: 'private' | 'public' = 'private',
): void {
  if (visibility === 'public') {
    response.setHeader('Cache-Control', PUBLIC_FOR_AN_HOUR);
  } else {
    response.setHeader('Cache-Control', IMMUTABLE_FOR_A_YEAR);
    // What is served depends on who is asking, and a cache that forgets that serves a drawing to
    // someone who has been signed out.
    response.setHeader('Vary', 'Cookie');
  }
  response.setHeader('ETag', image.etag);
  response.setHeader('Content-Type', image.contentType);
  response.setHeader('Content-Disposition', 'inline');

  if (request.headers['if-none-match'] === image.etag) {
    response.status(304).end();
    return;
  }

  response.setHeader('Content-Length', image.byteSize);

  const file = image.stream();
  file.on('error', (error: Error) => {
    // Nothing can be said politely once the first byte is out: cut the connection so the browser
    // sees a truncated response rather than a plausible half-picture.
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    next(error);
  });
  file.pipe(response);
}
