/**
 * **Every Proposal, written out to move to another practice system** (issue #157), with its
 * turns and its screenshots, into a directory that holds no export yet:
 *
 *   pnpm proposals:export -- --to ./proposals-export
 *   node dist/cli/export-proposals.js --to ./proposals-export
 *
 * Read back in on the other side with `proposals:import`. What it writes is unfiltered Club talk
 * and the authors' addresses: it is moved between the two hosts, and committed nowhere.
 */
import { parseArgs } from 'node:util';
import { exportProposals } from '../proposals/proposal-move.js';
import { commandArguments, runProposalsCommand } from './proposals.js';

const { values } = parseArgs({ args: commandArguments(), options: { to: { type: 'string' } } });

if (!values.to) {
  console.error('Usage: proposals:export --to <directory>');
  process.exit(1);
}
const directory = values.to;

await runProposalsCommand(async ({ db, fileStore }) => {
  const moved = await exportProposals({ db, fileStore }, directory);
  console.log(
    `Exported ${moved.proposals} Proposal(s), ${moved.turns} turn(s) and ` +
      `${moved.screenshots} screenshot(s) to ${directory}.`,
  );
});
