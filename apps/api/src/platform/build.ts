import { existsSync, readFileSync } from 'node:fs';

/**
 * Which Ricambi this is (ADR 0016): the Version of the Release it descends from, and the commit
 * it was built from when whatever built it said so.
 */
export interface Build {
  version: string;
  /** In full. `null` when the build was told no commit — never a guess. */
  commit: string | null;
}

/**
 * The repository root, seen from this module — in `src/` and in `dist/` alike. The image keeps
 * the repository's layout for exactly this reason (`Dockerfile`).
 */
const repositoryRoot = new URL('../../../../', import.meta.url);

/**
 * The Version is written in the root `package.json` and nowhere else; a Release writes it there.
 * The commit is a file beside it that only the image's build writes, from a build argument or
 * from the checkout's `.git`. Anywhere else — `pnpm dev`, the test suites — there is no such
 * file, and so no commit.
 */
export function readBuild(root: URL = repositoryRoot): Build {
  const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as {
    version?: unknown;
  };
  if (typeof version !== 'string' || version === '') {
    throw new Error(`The root package.json carries no Version (${root.pathname}).`);
  }

  const commitFile = new URL('commit', root);
  const written = existsSync(commitFile) ? readFileSync(commitFile, 'utf8').trim() : '';

  return { version, commit: /^[0-9a-f]{7,40}$/i.test(written) ? written.toLowerCase() : null };
}
