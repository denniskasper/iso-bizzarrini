/**
 * **How many pages a chosen catalog has, counted in the browser** (issue #69), so an
 * Administrator sees it before choosing pages from it, rather than after a long upload.
 *
 * pdf.js is loaded only here, the first time a catalog is chosen. It is handed the file a slice at
 * a time, as it asks for them: counting the pages reads the end of the file and its page tree,
 * not the few hundred MB a scanned catalog runs to. The server counts again when the catalog
 * arrives, and its count is the one that decides; this one can only refuse a range too early.
 */
export type PageCount = { pages: number } | { refused: string };

export async function countPages(file: File): Promise<PageCount> {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  class FileSlices extends pdfjs.PDFDataRangeTransport {
    override requestDataRange(begin: number, end: number) {
      void file
        .slice(begin, end)
        .arrayBuffer()
        .then((data) => this.onDataRange(begin, new Uint8Array(data)));
    }
  }

  const task = pdfjs.getDocument({
    range: new FileSlices(file.size, null),
    disableAutoFetch: true,
    disableStream: true,
  });
  try {
    const document = await task.promise;
    return { pages: document.numPages };
  } catch (error) {
    return {
      refused:
        error instanceof pdfjs.PasswordException
          ? 'It is protected by a password. Save it without one, then choose it again.'
          : 'It is not a PDF that can be read. Choose the catalog as one PDF.',
    };
  } finally {
    await task.destroy();
  }
}
