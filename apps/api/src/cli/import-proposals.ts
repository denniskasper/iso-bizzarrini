/**
 * **The Proposals another practice system exported, read in** (issue #157), into a system that
 * has none. It refuses one that already has Proposals, and writes nothing:
 *
 *   pnpm proposals:import -- --from ./proposals-export
 *   node dist/cli/import-proposals.js --from ./proposals-export
 *
 * A Proposal is given back to its author where an Account here has their address, and otherwise
 * stands without one.
 */
import { parseArgs } from 'node:util';
import { importProposals } from '../proposals/proposal-move.js';
import { commandArguments, runProposalsCommand } from './proposals.js';

const { values } = parseArgs({ args: commandArguments(), options: { from: { type: 'string' } } });

if (!values.from) {
  console.error('Usage: proposals:import --from <directory>');
  process.exit(1);
}
const directory = values.from;

await runProposalsCommand(async ({ db, fileStore }) => {
  const moved = await importProposals({ db, fileStore }, directory);
  console.log(
    `Imported ${moved.proposals} Proposal(s), ${moved.turns} turn(s) and ` +
      `${moved.screenshots} screenshot(s) from ${directory}.`,
  );
});
