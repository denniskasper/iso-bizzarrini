import {
  emptyCatalog,
  writePracticeArchive,
  type SeedDependencies,
  type SeedOutcome,
} from './practice-archive.js';
import { writePracticeRoster, type PracticeRosterOutcome } from './practice-roster.js';

/**
 * **A practice system put back in a known state**: the catalog and the roster emptied and written
 * again, invented. What `pnpm db:seed` does, here so that it can be tested.
 *
 * **Proposals are not practice data, and nothing here touches them** (issue #157). They are real
 * — a Fix or an Idea somebody took the trouble to hand over — so they, their turns and their
 * screenshots outlive every re-seeding. Their authors' Accounts do not: the roster is emptied, and
 * a Proposal lets go of its author rather than going with them.
 *
 * The caller has already been through `assertSeedable`: this empties tables.
 */
export async function reseedPracticeSystem(
  dependencies: SeedDependencies & {
    /** Undefined leaves every generated member unactivated, which is the safe default. */
    password: string | undefined;
  },
): Promise<{ archive: SeedOutcome; roster: PracticeRosterOutcome }> {
  const { db, fileStore, clock, password } = dependencies;

  await emptyCatalog(db, fileStore);
  const roster = await writePracticeRoster({ db, clock, password });
  const archive = await writePracticeArchive(dependencies);

  return { archive, roster };
}
