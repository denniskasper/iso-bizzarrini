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
 * A program rather than a library: on the machine that runs the read command, and in the
 * production image, where Ricambi reads an uploaded catalog (ADR 0018). Only the pages asked for
 * are rendered, so the catalog's front matter and technical data are never sent to a model.
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
      await poppler('pdftoppm', [
        '-r',
        String(options.dpi ?? 200),
        '-gray',
        '-png',
        ...range,
        pdf,
        join(directory, 'page'),
      ]);

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

/**
 * How many pages a PDF has, by Poppler's `pdfinfo`. Throws `PdfNotReadable` for a file Poppler
 * cannot open, so what is not a catalog is refused before any page of it is rendered.
 */
export async function pdfPageCount(pdf: string): Promise<number> {
  const info = await poppler('pdfinfo', [pdf]);
  const pages = /^Pages:\s+(\d+)\s*$/m.exec(info);
  if (!pages) {
    throw new PdfNotReadable('pdfinfo found no pages in it.');
  }
  return Number(pages[1]);
}

/** Poppler could not read the file as a PDF. */
export class PdfNotReadable extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PdfNotReadable';
  }
}

async function poppler(program: 'pdftoppm' | 'pdfinfo', args: string[]): Promise<string> {
  try {
    const { stdout } = await run(program, args);
    return stdout;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`${program} is not installed. It is part of Poppler (poppler-utils).`, {
        cause: error,
      });
    }
    throw new PdfNotReadable(`${program} could not read it as a PDF.`, { cause: error });
  }
}
