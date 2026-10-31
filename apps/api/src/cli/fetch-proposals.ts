/**
 * **The New Proposals, for the developer's agent to work from** (issue #157). Without an id it
 * lists them; with one it prints that Proposal in full, with where its screenshots are:
 *
 *   pnpm proposals:fetch
 *   pnpm proposals:fetch -- <proposal id>
 *   node dist/cli/fetch-proposals.js <proposal id>
 *
 * It reads and changes nothing: a Proposal is taken up on the Proposals screen.
 */
import { describeProposal, listNewProposals } from '../proposals/proposal-fetch.js';
import { commandArguments, runProposalsCommand } from './proposals.js';

const [proposalId] = commandArguments();

await runProposalsCommand(async ({ config, db }) => {
  if (proposalId === undefined) {
    process.stdout.write(await listNewProposals(db));
    return;
  }
  const described = await describeProposal(
    { db, storagePath: config.files.storagePath },
    proposalId,
  );
  if (described === null) {
    console.error(`There is no handed-over Proposal ${proposalId}.`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(described);
});
