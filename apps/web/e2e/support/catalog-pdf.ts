/**
 * **A catalog PDF of blank pages**, written as `apps/api/tests/support/fixture-pdf.ts` writes
 * one, for the practice server's fake Reading method to estimate.
 */
export function fixturePdf(pageCount: number): Buffer {
  const pageIds = Array.from({ length: pageCount }, (_, index) => 4 + index);
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    '<< /Length 0 >>\nstream\n\nendstream',
    ...pageIds.map(() => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 280] /Contents 3 0 R >>'),
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
