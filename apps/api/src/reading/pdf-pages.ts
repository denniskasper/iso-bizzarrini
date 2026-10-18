import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { PageSource } from './read-catalog.js';

const run = promisify(execFile);

/**
 * The pages of a catalog PDF, rendered by **Poppler's `pdftoppm`** at the resolution the Club's
 * scans were made at, in greyscale — what the trial read from.
 *
 * A program on the operator's machine rather than a library in the production image, because
 * the read command is run there and nowhere else (ADR 0017). Only the pages asked for are
 * rendered, so the catalog's front matter and technical data are never sent to a model.
 */
export function pdfPages(
  options: { dpi?: number; first?: number; last?: number } = {},
): PageSource {
  return async function* (pdf: string) {
    const directory = await mkdtemp(join(tmpdir(), 'ricambi-pages-'));
    try {
      const range = [
        ...(options.first ? ['-f', String(options.first)] : []),
        ...(options.last ? ['-l', String(options.last)] : []),
      ];
      try {
        await run('pdftoppm', [
          '-r',
          String(options.dpi ?? 200),
          '-gray',
          '-png',
          ...range,
          pdf,
          join(directory, 'page'),
        ]);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error('pdftoppm is not installed. It is part of Poppler (poppler-utils).', {
            cause: error,
          });
        }
        throw error;
      }

      const files = (await readdir(directory))
        .map((file) => ({ file, page: Number(/(\d+)\.png$/.exec(file)?.[1]) }))
        .filter((entry) => Number.isInteger(entry.page))
        .sort((a, b) => a.page - b.page);

      for (const { file, page } of files) {
        yield { page, image: await readFile(join(directory, file)) };
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
}
