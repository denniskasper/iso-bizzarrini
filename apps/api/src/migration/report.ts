import type { ArchiveLoadReport, RowProblem, Tally } from './load-archive.js';

/**
 * What the load did, written for the person who ran it.
 *
 * **The rejected rows are the point of it.** A migration that reports totals is a migration that
 * has to be trusted; one that names every row it could not take, with the line number the
 * volunteer can go and look at in their own spreadsheet, is one that can be *finished* — the
 * sheet is corrected and the loader run again, which is what re-runnability is for.
 *
 * Markdown because it is read on a laptop by one person, and stays legible if they paste it into
 * an e-mail to whoever keeps the sheet.
 */
export function renderReport(report: ArchiveLoadReport): string {
  const lines: string[] = [];
  const verb = report.dryRun ? 'would be created' : 'created';

  lines.push(`# Archive load — ${report.archive}`, '');

  if (report.dryRun) {
    lines.push(
      '**Dry run. Nothing was written.** Every count below is what a real run would do, and it',
      'is a count of rows that really were written and then rolled back rather than a guess.',
      '',
    );
  }

  lines.push(
    '## What somebody decided about these sheets',
    '',
    'Which column is the Catalog Number and which the Disegno Origine was confirmed as:',
    '',
    `> ${report.confirmedAgainst}`,
    '',
    `Dates were read **${report.dateOrder}**, so \`03/04/2025\` is ` +
      `${report.dateOrder === 'day-first' ? '3 April' : '4 March'}. Nothing in a cell can tell ` +
      'the two apart; the plan says which, and this is where it is answerable.',
    '',
    '## What was loaded',
    '',
    `| | ${verb} | already there |`,
    '| --- | ---: | ---: |',
    row('Models', report.models),
    row('Tavole', report.tavole),
    row('Positions', report.positions),
    row('Parts', report.parts),
    row('Listings', report.listings),
    row('Fitments', report.fitments),
    row('Equivalents', report.equivalents),
    row('Sources', report.sources),
    row('Sub-assemblies', report.subAssemblies),
    row('Related Positions', report.relatedPositions),
    `| Scans | ${report.scans.ingested} | ${report.scans.alreadyIngested} |`,
    '',
    `${report.rowsLoaded} of ${report.rowsRead} rows of the parts sheet loaded.`,
    report.fieldsFilled > 0
      ? `${report.fieldsFilled} empty fields on records the archive already had were filled in — ` +
          'a missing description, a quantity nobody had recorded, a qualification. Nothing that ' +
          'had a value in it was overwritten.'
      : 'No field that already had a value was touched.',
    '',
    '## Which column was read as which kind of Equivalent',
    '',
  );

  if (report.equivalentColumns.length === 0) {
    lines.push('The plan maps no columns to Equivalents.', '');
  } else {
    lines.push('| column | kind | maker |', '| --- | --- | --- |');
    for (const column of report.equivalentColumns) {
      // Null covers both a donor-vehicle column, whose cell *is* the car, and a column whose
      // maker is another column of the same row — in either case the sheet says and the plan
      // does not.
      lines.push(`| ${column.column} | ${column.kind} | ${column.maker ?? '*from the sheet*'} |`);
    }
    lines.push('');
  }

  lines.push(...problems('Rows that could not be loaded', report.rejected, 'Every row loaded.'));
  lines.push(
    ...problems(
      'What was loaded with something missing',
      report.warnings,
      'Nothing was left out of a row that loaded.',
    ),
  );

  return lines.join('\n');
}

function row(what: string, tally: Tally): string {
  return `| ${what} | ${tally.created} | ${tally.matched} |`;
}

function problems(heading: string, found: RowProblem[], whenNone: string): string[] {
  if (found.length === 0) {
    return [`## ${heading}`, '', whenNone, ''];
  }

  return [
    `## ${heading} (${found.length})`,
    '',
    '| file | line | row | why |',
    '| --- | ---: | --- | --- |',
    ...found.map(
      (problem) =>
        `| ${problem.file} | ${problem.line} | ${problem.at || '—'} | ${problem.reason.replace(/\|/g, '\\|')} |`,
    ),
    '',
  ];
}
