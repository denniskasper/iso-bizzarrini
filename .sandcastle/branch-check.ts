import { execFileSync } from 'node:child_process';

// What a run is cut from, and what a branch has to be part of before it counts as finished.
const BASE = 'origin/main';

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function succeeds(...args: string[]): boolean {
  try {
    git(...args);
    return true;
  } catch {
    return false;
  }
}

/**
 * Refuses to start a run on a branch whose work has already been merged, and says what a new
 * branch should be cut from.
 *
 * Sandcastle checks a branch out as it finds it. One that exists — here or on the remote, which
 * git will quietly recreate it from — is used at the commit it stands on, and is only ever
 * brought forward from its own remote copy, never from `main`. So the branch left behind by a
 * merged pull request starts the next run on last week's tree: without whatever else was merged
 * meanwhile, and with nothing to say so until the agent cannot find a file the issue told it to
 * read.
 *
 * A branch that still holds unmerged commits is a different thing — a run nobody has opened a
 * pull request from yet — and the next run is allowed to add to it.
 *
 * "Merged" is read as "an ancestor of `main`", which is true of a pull request merged with a
 * merge commit, as they are here. A squashed one would leave a branch this takes for unfinished.
 *
 * A branch with no commits of its own is neither: a run that stopped before the agent wrote
 * anything (a missing image, a missing credential) leaves one behind, cut from `main` as it then
 * was. It holds no work, so the local copy is removed and a new one cut, without asking. It is
 * told apart from a merged one by standing on `main`'s own line of commits, where a merged pull
 * request's last commit is only reached through its merge.
 */
export function baseForRun(branch: string): string {
  try {
    git('fetch', '--prune', 'origin');
  } catch {
    throw new Error(
      `Could not fetch from origin, so there is no telling whether '${branch}' is stale. ` +
        'Nothing was started.',
    );
  }

  const copies = [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`].filter((ref) =>
    succeeds('rev-parse', '--verify', '--quiet', ref),
  );

  const local = `refs/heads/${branch}`;
  if (copies.includes(local) && neverWorkedOn(local)) {
    try {
      git('branch', '-D', branch);
      copies.splice(copies.indexOf(local), 1);
      console.log(`'${branch}' was left by a run that wrote nothing. Removed; a new one is cut.`);
    } catch {
      // Checked out in a worktree, most likely: refused below, with the way out.
    }
  }

  const stale = copies.filter((ref) => succeeds('merge-base', '--is-ancestor', ref, BASE));
  if (stale.length > 0) {
    const localStale = stale.includes(local);
    const remote = stale.includes(`refs/remotes/origin/${branch}`);
    throw new Error(
      [
        `'${branch}' is left over from a run that has already been merged into ${BASE}.`,
        'Starting on it would give the agent the tree as it was then. Nothing was started.',
        '',
        'Remove it, and run this again:',
        ...(localStale ? [`  git branch -d ${branch}`] : []),
        ...(remote ? [`  git push origin --delete ${branch}`] : []),
      ].join('\n'),
    );
  }

  if (copies.length > 0) {
    console.log(`'${branch}' holds work that is not on ${BASE} yet. This run adds to it.`);
  }

  // Only read when the branch does not exist: a new one is cut from what is on the remote, not
  // from whatever happens to be checked out in the directory the run was started from.
  return BASE;
}

/** Whether the branch stands on `main`'s own line of commits: cut from it, and never added to. */
function neverWorkedOn(ref: string): boolean {
  const tip = git('rev-parse', ref);
  return git('rev-list', '--first-parent', BASE).split('\n').includes(tip);
}
