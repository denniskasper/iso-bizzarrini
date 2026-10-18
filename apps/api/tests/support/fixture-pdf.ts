import { Readable } from 'node:stream';

/**
 * **A catalog PDF of blank pages**, written out object by object rather than kept as a binary
 * fixture, so what it holds is readable here. Poppler renders it as any scanned catalog: one
 * image per page, which the fake Reading method then estimates.
 *
 * A page is 200 by 280 points, small enough that rendering a few is quick.
 */
export function fixturePdf(pageCount: number): Buffer {
  const { head, tail } = fixtureParts(pageCount, 0);
  return Buffer.concat([head, tail]);
}

/**
 * **A catalog the size of a scanned one** (issue #65): the blank pages of `fixturePdf`, and
 * `padding` bytes of a stream object nothing refers to, as a scan's images take up the space.
 * Made a chunk at a time as it is sent, so the test sending it never holds it whole either.
 */
export function largeFixturePdf(
  pageCount: number,
  padding: number,
): { byteSize: number; stream(): Readable } {
  const { head, tail } = fixtureParts(pageCount, padding);
  return {
    byteSize: head.byteLength + padding + tail.byteLength,
    stream: () =>
      Readable.from(
        (function* () {
          yield head;
          const chunk = Buffer.alloc(64 * 1024, 0x20);
          for (let left = padding; left > 0; left -= chunk.byteLength) {
            yield left >= chunk.byteLength ? chunk : chunk.subarray(0, left);
          }
          yield tail;
        })(),
      ),
  };
}

/** The PDF before the padding's bytes, and after them. */
function fixtureParts(pageCount: number, padding: number): { head: Buffer; tail: Buffer } {
  const pageIds = Array.from({ length: pageCount }, (_, index) => 4 + index);
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    '<< /Length 0 >>\nstream\n\nendstream',
    ...pageIds.map(() => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 280] /Contents 3 0 R >>'),
  ];
  const paddingId = objects.length + 1;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  if (padding === 0) {
    return {
      head: Buffer.from(pdf, 'latin1'),
      tail: Buffer.from(xrefOf(offsets, Buffer.byteLength(pdf)), 'latin1'),
    };
  }

  offsets.push(Buffer.byteLength(pdf));
  const head = pdf + `${paddingId} 0 obj\n<< /Length ${padding} >>\nstream\n`;
  const after = '\nendstream\nendobj\n';
  const before = Buffer.byteLength(head) + padding + Buffer.byteLength(after);
  return {
    head: Buffer.from(head, 'latin1'),
    tail: Buffer.from(after + xrefOf(offsets, before), 'latin1'),
  };
}

/** The cross-reference table and trailer, for objects at `offsets`, starting at byte `at`. */
function xrefOf(offsets: number[], at: number): string {
  let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  return xref + `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`;
}
