import { readdirSync, readFileSync } from 'node:fs';

/**
 * **What the conversation knows of Ricambi** (issue #155): the glossary, the product spec and
 * the ADRs of the Version that is running, so it can hold an author's words against Ricambi's own
 * and know what has already been decided. Not the source code and not the issues: the
 * conversation is with somebody who never sees either.
 */
export interface BundledDocument {
  /** From the repository root, as the conversation is told it. */
  path: string;
  text: string;
}

/**
 * The repository root, seen from this module — in `src/` and in `dist/` alike. The image copies
 * the documents to where they are in a checkout for exactly this reason (`Dockerfile`).
 */
const repositoryRoot = new URL('../../../../', import.meta.url);

/**
 * The glossary, the spec, then every ADR by its number. Always in the same order, since they are
 * the cached part of every request and a prefix that changes is a cache that is paid for again.
 * Throws where any of them is missing: a conversation that cannot check a word against the
 * glossary is not the one the playbook describes.
 */
export function readBundledDocuments(root: URL = repositoryRoot): BundledDocument[] {
  const read = (path: string): BundledDocument => ({
    path,
    text: readFileSync(new URL(path, root), 'utf8'),
  });
  const adrs = readdirSync(new URL('docs/adr/', root))
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => read(`docs/adr/${name}`));
  if (adrs.length === 0) {
    throw new Error(`There are no ADRs in ${new URL('docs/adr/', root).pathname}.`);
  }
  return [read('GLOSSARY.md'), read('docs/spec.md'), ...adrs];
}
