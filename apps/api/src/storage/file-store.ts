import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Where the archive's image files live: **a directory that nothing serves.**
 *
 * The whole point of ADR 0006 is that there is no public path to a scan — no bucket, no CDN,
 * no `express.static` over the uploads folder — so the only way out of this store is the
 * authenticated route that reads from it. Keeping that true is a property of the interface:
 * callers hand it a *key*, never a path, and never learn where the file actually is.
 *
 * A local directory is the deployment ADR 0009 describes — one EU VPS, everything on the box,
 * backed up nightly to a different provider. If that ever becomes object storage, this
 * interface is what it is written behind.
 */
export interface FileStore {
  write(key: string, contents: Buffer): Promise<void>;
  /**
   * `contents` written a chunk at a time, for a file too large to hold in memory: an uploaded
   * catalog (issue #65). Nothing is left under the key where it fails part-way.
   */
  writeFrom(key: string, contents: Readable): Promise<void>;
  /** `null` when there is no such file, so a caller can answer 404 rather than crash. */
  open(key: string): Promise<StoredFile | null>;
  /** Removes a key and anything beneath it. Silent when there is nothing there. */
  remove(keyOrPrefix: string): Promise<void>;
}

export interface StoredFile {
  byteSize: number;
  stream(): ReadStream;
}

export function createFileStore(rootPath: string): FileStore {
  const root = resolve(rootPath);

  return {
    async write(key, contents) {
      const path = pathFor(root, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents);
    },

    async writeFrom(key, contents) {
      const path = pathFor(root, key);
      await mkdir(dirname(path), { recursive: true });
      try {
        await pipeline(contents, createWriteStream(path));
      } catch (error) {
        await rm(path, { force: true });
        throw error;
      }
    },

    async open(key) {
      const path = pathFor(root, key);
      try {
        const stats = await stat(path);
        if (!stats.isFile()) {
          return null;
        }
        return { byteSize: stats.size, stream: () => createReadStream(path) };
      } catch (error) {
        if (isMissing(error)) {
          return null;
        }
        throw error;
      }
    },

    async remove(keyOrPrefix) {
      await rm(pathFor(root, keyOrPrefix), { recursive: true, force: true });
    },
  };
}

/**
 * Keys are ours — built from record ids, never from a filename an Editor chose — but this is
 * the one place a mistake reaches the filesystem, so it is checked here rather than trusted
 * everywhere upstream.
 */
function pathFor(root: string, key: string): string {
  const path = resolve(root, key);
  if (path !== root && !path.startsWith(root + sep)) {
    throw new Error(`Refusing a file key that escapes the store: ${key}`);
  }
  return path;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'ENOENT'
  );
}

/** Where one Catalog run's files live, beginning with the catalog PDF it was uploaded with. */
export function catalogRunKeyPrefix(runId: string): string {
  return join('catalog-runs', runId);
}

/** A page a Catalog run set aside, as an image for a person to look at (issue #60). */
export function setAsidePageKey(runId: string, page: number): string {
  return join(catalogRunKeyPrefix(runId), 'set-aside', `page-${page}.png`);
}

/** Where one Scan's files live. Everything about a scan is removed by removing its prefix. */
export function scanKeyPrefix(scanId: string): string {
  return join('scans', scanId);
}

/** Where one Table sheet's file lives. */
export function tableSheetKeyPrefix(tableSheetId: string): string {
  return join('table-sheets', tableSheetId);
}

/**
 * And where one Photograph's live. **Its own top-level prefix, not a Part's subdirectory**: a
 * Photograph is removed on its own far more often than a Part is, and a key built from the Part
 * would have to be rewritten the day one is moved off a Contribution and onto the record
 * (story 119). The id is the only thing in the path, and the id never changes.
 */
export function photographKeyPrefix(photographId: string): string {
  return join('photographs', photographId);
}

/**
 * Where one Sample's public copy of its drawing lives (ADR 0019). **A prefix of its own**, so the
 * one kind of file in this store that anybody may be served is never under a Scan's key.
 */
export function sampleDrawingKeyPrefix(drawingId: string): string {
  return join('sample-drawings', drawingId);
}

/** Where one screenshot shown with a Proposal lives (issue #154). The id is the whole path. */
export function proposalScreenshotKeyPrefix(screenshotId: string): string {
  return join('proposal-screenshots', screenshotId);
}
