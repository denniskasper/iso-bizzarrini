import { and, count, eq, inArray, ne, notExists } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import {
  contributions,
  listings,
  marks,
  parts,
  photographs,
  positions,
  scans,
  tableSheets,
  tavole,
} from '../db/schema.js';
import type { Logger } from '../platform/logger.js';
import {
  photographKeyPrefix,
  scanKeyPrefix,
  tableSheetKeyPrefix,
  type FileStore,
} from '../storage/file-store.js';

/** What discarding a Tavola takes with it, or took. */
export interface DiscardedTavola {
  /** The Model the Tavola belonged to. */
  modelId: string;
  positions: number;
  marks: number;
  listings: number;
  tableSheets: number;
  scan: boolean;
  /** The Parts listed on it and nowhere else, which go with it. */
  parts: {
    id: string;
    catalogNumber: string | null;
    nameIt: string | null;
    nameEn: string | null;
  }[];
  /** The prefixes its files, and those Parts' Photographs, are under, for `removeDiscardedFiles`. */
  fileKeys: string[];
}

/**
 * **What discarding a Tavola would take** (issue #84), worked out and nothing changed: the
 * reckoning `discardTavola` then applies, so what an Administrator is told would go is what goes.
 * `'has contributions'` where a Contribution on any of its Positions, decided or not, keeps it.
 */
export async function reckonDiscard(
  session: DbSession,
  tavolaId: string,
): Promise<DiscardedTavola | 'has contributions'> {
  const [tavola] = await session
    .select({ modelId: tavole.modelId })
    .from(tavole)
    .where(eq(tavole.id, tavolaId));
  if (!tavola) {
    throw new Error(`There is no Tavola ${tavolaId} to discard.`);
  }

  const onIt = session
    .select({ id: positions.id })
    .from(positions)
    .where(eq(positions.tavolaId, tavolaId));
  const [waiting] = await session
    .select({ id: contributions.id })
    .from(contributions)
    .where(inArray(contributions.positionId, onIt))
    .limit(1);
  if (waiting) {
    return 'has contributions';
  }

  const listed = await session
    .select({ partId: listings.partId })
    .from(listings)
    .where(eq(listings.tavolaId, tavolaId));
  const partIds = [...new Set(listed.map((row) => row.partId))];
  const [positionCount] = await session
    .select({ n: count() })
    .from(positions)
    .where(eq(positions.tavolaId, tavolaId));
  const [markCount] = await session
    .select({ n: count() })
    .from(marks)
    .where(inArray(marks.positionId, onIt));
  const [scan] = await session
    .select({ id: scans.id })
    .from(scans)
    .where(eq(scans.tavolaId, tavolaId));
  const sheets = await session
    .select({ id: tableSheets.id })
    .from(tableSheets)
    .where(eq(tableSheets.tavolaId, tavolaId));

  // Listed on no other Tavola, and carrying no Contribution: once its Listings here go with the
  // Tavola, nothing keeps it.
  const going =
    partIds.length === 0
      ? []
      : await session
          .select({
            id: parts.id,
            catalogNumber: parts.catalogNumber,
            nameIt: parts.nameIt,
            nameEn: parts.nameEn,
          })
          .from(parts)
          .where(
            and(
              inArray(parts.id, partIds),
              notExists(
                session
                  .select({ id: listings.id })
                  .from(listings)
                  .where(and(eq(listings.partId, parts.id), ne(listings.tavolaId, tavolaId))),
              ),
              notExists(
                session
                  .select({ id: contributions.id })
                  .from(contributions)
                  .where(eq(contributions.partId, parts.id)),
              ),
            ),
          )
          .orderBy(parts.catalogNumber, parts.nameIt);
  const goingIds = going.map((part) => part.id);
  const photographed =
    goingIds.length === 0
      ? []
      : await session
          .select({ id: photographs.id })
          .from(photographs)
          .where(inArray(photographs.partId, goingIds));

  return {
    modelId: tavola.modelId,
    positions: positionCount?.n ?? 0,
    marks: markCount?.n ?? 0,
    listings: listed.length,
    tableSheets: sheets.length,
    scan: scan !== undefined,
    parts: going,
    fileKeys: [
      ...(scan ? [scanKeyPrefix(scan.id)] : []),
      ...sheets.map((sheet) => tableSheetKeyPrefix(sheet.id)),
      ...photographed.map((photograph) => photographKeyPrefix(photograph.id)),
    ],
  };
}

/**
 * **Discarding an Unchecked Tavola** (issue #82): the one rule for taking a Tavola out whole, which
 * reading it again and removing it both follow, by the reckoning of `reckonDiscard`.
 *
 * The Tavola goes, and with it its Positions, Sub-assemblies, Marks, Listings, Table sheets, Scan
 * and reading doubts. So does every Part it listed that is now listed nowhere and carries no
 * Contribution, with its Fitments, Equivalents, Sources and Photographs. A Tavola with a
 * Contribution on any of its Positions, decided or not, is left as it is: a Member's words are
 * never lost as a side effect.
 *
 * The caller has found the Tavola, and decided it may go. This runs in the caller's transaction
 * and touches no file. Once that has committed, the caller
 * hands the answer's `fileKeys` to `removeDiscardedFiles`.
 */
export async function discardTavola(
  session: DbSession,
  tavolaId: string,
): Promise<DiscardedTavola | 'has contributions'> {
  const reckoned = await reckonDiscard(session, tavolaId);
  if (reckoned === 'has contributions') {
    return reckoned;
  }
  await session.delete(tavole).where(eq(tavole.id, tavolaId));
  const goingIds = reckoned.parts.map((part) => part.id);
  if (goingIds.length > 0) {
    await session.delete(parts).where(inArray(parts.id, goingIds));
  }
  return reckoned;
}

/**
 * The files of discarded Tavole, once the change that discarded them has committed. A file that
 * cannot be removed is logged, and undoes nothing.
 */
export async function removeDiscardedFiles(
  fileStore: FileStore,
  logger: Logger,
  fileKeys: string[],
): Promise<void> {
  for (const key of fileKeys) {
    await fileStore.remove(key).catch((error: unknown) => {
      logger.warn({ err: error, key }, 'Could not remove a discarded Tavola’s files');
    });
  }
}
