import type { ReadingLoadReport } from './load-reading.js';
import type { RowProblem } from './load-archive.js';

/** What loading a machine-read catalog did, for the person who ran it. Markdown, like the other. */
export function renderReadingReport(report: ReadingLoadReport): string {
  const lines: string[] = [`# Catalog reading load — ${report.reading}`, ''];

  if (report.dryRun) {
    lines.push(
      '**Dry run. Nothing was written.** Every count below is what a real run would do.',
      '',
    );
  }

  lines.push(
    `Model: ${report.model}. Every Tavola loaded is **Unchecked**: only Editors see it until one`,
    'of them compares it with its sheets and publishes it.',
    '',
    '| Tavola | Outcome | Listings | Reading method |',
    '| --- | --- | --- | --- |',
    ...report.tavole.map(
      (tavola) =>
        `| ${tavola.number} | ${tavola.outcome}${tavola.reason ? ` — ${tavola.reason}` : ''} | ` +
        `${tavola.listings} | ${tavola.readingMethod} |`,
    ),
    '',
    `${report.scans} Scans, ${report.tableSheets} Table sheets and ${report.marks} proposed Marks. ` +
      `${report.partsDiscarded} Parts that appeared only on a discarded Tavola went with it.`,
    '',
  );

  section(lines, 'Refused', report.rejected);
  section(lines, 'Loaded with something missing', report.warnings);
  return lines.join('\n');
}

function section(lines: string[], title: string, problems: RowProblem[]): void {
  lines.push(`## ${title} (${problems.length})`, '');
  if (problems.length === 0) {
    lines.push('None.', '');
    return;
  }
  for (const problem of problems) {
    lines.push(`- **${problem.file}, line ${problem.line}** (${problem.at}): ${problem.reason}`);
  }
  lines.push('');
}
