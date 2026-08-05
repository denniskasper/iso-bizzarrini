import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { categorySlug, numericPrefixOf } from '../catalog/naming.js';
import type { DbSession } from '../db/client.js';
import {
  equivalents,
  fitments,
  listings,
  models,
  parts,
  positions,
  relatedPositions,
  scans,
  sources,
  subAssemblies,
  tavole,
  type NewEquivalentRow,
  type NewListingRow,
  type NewPartRow,
  type NewSourceRow,
  type PartRow,
  type PositionRow,
} from '../db/schema.js';
import { createCategoryRepository } from '../repositories/category-repository.js';
import { createPositionRepository } from '../repositories/position-repository.js';

/**
 * Writing the club's material into the archive **once**, however many times the migration is
 * run.
 *
 * This is the whole of ticket 13's re-runnability rule in one place. Every operation is
 * *find or add*: it says whether it created something or found it already there, and the two
 * counts are what the report is made of. Nothing here deletes and nothing overwrites — the
 * strongest thing it will do to a record that already exists is fill in a field that is empty,
 * because a second run of the spreadsheet a Part came from must not be able to undo what an
 * Editor has since worked out about it (ADR 0005).
 *
 * It works on a `DbSession`, so the caller decides whether that is the pool or a transaction
 * that will be rolled back — which is how a dry run is the real load rather than a second
 * implementation of it.
 */
export interface Written {
  id: string;
  created: boolean;
  /** Fields that were empty on a record already there and are not any more. Never overwrites. */
  filled?: number;
}

export interface TavolaInput {
  modelId: string;
  number: string;
  nameIt: string;
  nameEn: string;
  category: string;
  catalogSection: string | null;
  catalogGroup: string | null;
  catalogSubgroup: string | null;
}

export interface ModelInput {
  brand: string;
  name: string;
  series: string | null;
  modelYears: string | null;
}

/** What became of a Position asked to join a named group. */
export type SubAssemblyGrouping = 'joined' | 'already in this group' | 'in another group';

export interface ArchiveWriter {
  findOrAddModel(model: ModelInput): Promise<Written>;
  findOrAddTavola(tavola: TavolaInput): Promise<Written>;
  findOrAddPosition(tavolaId: string, number: string): Promise<Written>;
  positionsOn(tavolaId: string): Promise<PositionRow[]>;

  findPartByCatalogNumber(catalogNumber: string): Promise<PartRow | null>;
  /** The unnumbered Part a sheet row already produced, found again by where it was listed. */
  findPartListedAs(where: {
    tavolaId: string;
    positionId: string | null;
    nameIt: string | null;
    nameEn: string | null;
  }): Promise<PartRow | null>;
  addPart(values: NewPartRow): Promise<PartRow>;
  /** Fills only the fields the archive has nothing in. Answers how many it filled. */
  fillPart(part: PartRow, values: NewPartRow): Promise<number>;

  findOrAddListing(listing: NewListingRow): Promise<Written>;
  findOrAddFitment(partId: string, modelId: string, qualifier: string | null): Promise<Written>;
  findOrAddEquivalent(equivalent: NewEquivalentRow): Promise<Written>;
  findOrAddSource(source: NewSourceRow): Promise<Written>;

  findOrAddSubAssembly(tavolaId: string, name: string): Promise<Written>;
  putInSubAssembly(positionId: string, subAssemblyId: string): Promise<SubAssemblyGrouping>;
  /** Both ends of one link, in one row, whichever way round the sheet named them. */
  relatePositions(positionId: string, otherPositionId: string): Promise<Written>;

  hasScan(tavolaId: string): Promise<boolean>;
}

export function createArchiveWriter(session: DbSession): ArchiveWriter {
  const categoryRepository = createCategoryRepository(session);
  const positionRepository = createPositionRepository(session);

  /** Postgres counts two NULLs as different; a migration matching rows has to count them same. */
  const is = (column: PgColumn, value: string | number | null): SQL =>
    value === null ? isNull(column) : eq(column, value);

  /**
   * **The find-or-add shape itself**, written once: try the insert, and read back whatever was
   * already there when the database declined it.
   *
   * The insert *is* the lookup, deliberately — a read-then-write would let a second Editor
   * working while a migration runs slip a row in between the two. The unique constraint decides,
   * and this only has to ask what it decided.
   */
  async function addOrFind<T extends { id: string }>(
    add: () => Promise<T[]>,
    find: () => Promise<T[]>,
    what: string,
  ): Promise<{ row: T; created: boolean }> {
    const [added] = await add();
    if (added) {
      return { row: added, created: true };
    }
    const [existing] = await find();
    return { row: expected(existing, what), created: false };
  }

  return {
    async findOrAddModel(model) {
      const [existing] = await session
        .select()
        .from(models)
        .where(
          and(
            is(models.brand, model.brand),
            is(models.name, model.name),
            is(models.series, model.series),
          ),
        )
        .limit(1);

      if (existing) {
        return { id: existing.id, created: false };
      }

      const [added] = await session.insert(models).values(model).returning();
      return { id: expected(added, 'Model').id, created: true };
    },

    async findOrAddTavola(tavola) {
      const category = await categoryRepository.findOrAdd(
        tavola.category,
        categorySlug(tavola.category),
      );

      const { row, created } = await addOrFind(
        () =>
          session
            .insert(tavole)
            .values({
              modelId: tavola.modelId,
              number: tavola.number,
              numberSort: numericPrefixOf(tavola.number),
              nameIt: tavola.nameIt,
              nameEn: tavola.nameEn,
              categoryId: category.id,
              catalogSection: tavola.catalogSection,
              catalogGroup: tavola.catalogGroup,
              catalogSubgroup: tavola.catalogSubgroup,
            })
            .onConflictDoNothing({ target: [tavole.modelId, tavole.number] })
            .returning(),
        () =>
          session
            .select()
            .from(tavole)
            .where(and(eq(tavole.modelId, tavola.modelId), eq(tavole.number, tavola.number)))
            .limit(1),
        'Tavola',
      );
      return { id: row.id, created };
    },

    async findOrAddPosition(tavolaId, number) {
      const { position, added } = await positionRepository.findOrAdd({ tavolaId, number });
      return { id: position.id, created: added };
    },

    positionsOn(tavolaId) {
      return session.select().from(positions).where(eq(positions.tavolaId, tavolaId));
    },

    async findPartByCatalogNumber(catalogNumber) {
      const [row] = await session
        .select()
        .from(parts)
        .where(eq(parts.catalogNumber, catalogNumber))
        .limit(1);
      return row ?? null;
    },

    /**
     * **How a Part with no Catalog Number is recognised on a second run.** Most of the club's
     * rows carry one and are matched by it — that is the identity rule (ADR 0001) — but a
     * fastener the factory never numbered has nothing to be matched by except where the sheet
     * put it. So it is found again by the Listing that placed it: the same row of the same sheet
     * names the same drawing, the same number and the same words, and lands on the same Part.
     *
     * A Part an Editor has since *renamed* will not be recognised, and a re-run would record a
     * second one. That is written down in `docs/operations/archive-migration.md` rather than
     * papered over: matching on anything looser would merge two genuinely different unnumbered
     * screws at one Position, which is worse and much harder to see.
     */
    async findPartListedAs({ tavolaId, positionId, nameIt, nameEn }) {
      const rows = await session
        .select({ part: parts })
        .from(listings)
        .innerJoin(parts, eq(listings.partId, parts.id))
        .where(
          and(
            eq(listings.tavolaId, tavolaId),
            is(listings.positionId, positionId),
            isNull(parts.catalogNumber),
            is(parts.nameIt, nameIt),
            is(parts.nameEn, nameEn),
          ),
        )
        .limit(1);

      return rows[0]?.part ?? null;
    },

    async addPart(values) {
      const [added] = await session.insert(parts).values(values).returning();
      return expected(added, 'Part');
    },

    async fillPart(part, values) {
      const patch: Partial<NewPartRow> = {};
      for (const [field, value] of Object.entries(values) as [keyof NewPartRow, string | null][]) {
        if (value !== null && value !== undefined && part[field] === null) {
          patch[field] = value;
        }
      }

      const filled = Object.keys(patch).length;
      if (filled > 0) {
        await session.update(parts).set(patch).where(eq(parts.id, part.id));
      }
      return filled;
    },

    /**
     * A Part's appearance on a sheet — and, where it is already there, the one field a corrected
     * spreadsheet can still put right.
     *
     * **The quantity is fillable and the drawn flag is not**, which is not an oversight. A blank
     * quantity is the archive saying nobody has recorded a count, so a later export that has one
     * is new knowledge; `drawn` is a boolean that is always one thing or the other, so there is
     * no "unset" to fill and changing it would be overwriting a judgement.
     */
    async findOrAddListing(listing) {
      const { row, created } = await addOrFind(
        () =>
          session
            .insert(listings)
            .values(listing)
            // Both unique arrangements at once — the one over the three columns, and the partial
            // index that catches a Part listed twice on a sheet at no Position at all.
            .onConflictDoNothing()
            .returning(),
        () =>
          session
            .select()
            .from(listings)
            .where(
              and(
                eq(listings.partId, listing.partId),
                eq(listings.tavolaId, listing.tavolaId),
                is(listings.positionId, listing.positionId ?? null),
              ),
            )
            .limit(1),
        'Listing',
      );

      if (!created && row.quantityPerCar === null && (listing.quantityPerCar ?? null) !== null) {
        await session
          .update(listings)
          .set({ quantityPerCar: listing.quantityPerCar })
          .where(eq(listings.id, row.id));
        return { id: row.id, created, filled: 1 };
      }

      return { id: row.id, created };
    },

    async findOrAddFitment(partId, modelId, qualifier) {
      const { row, created } = await addOrFind(
        () =>
          session
            .insert(fitments)
            .values({ partId, modelId, qualifier })
            .onConflictDoNothing({ target: [fitments.partId, fitments.modelId] })
            .returning(),
        () =>
          session
            .select()
            .from(fitments)
            .where(and(eq(fitments.partId, partId), eq(fitments.modelId, modelId)))
            .limit(1),
        'Fitment',
      );

      // A qualification the archive does not have yet is worth having; one it does have is
      // somebody's words and stays theirs.
      if (!created && row.qualifier === null && qualifier !== null) {
        await session.update(fitments).set({ qualifier }).where(eq(fitments.id, row.id));
        return { id: row.id, created, filled: 1 };
      }
      return { id: row.id, created };
    },

    async findOrAddEquivalent(equivalent) {
      const { row, created } = await addOrFind(
        () => session.insert(equivalents).values(equivalent).onConflictDoNothing().returning(),
        () =>
          session
            .select()
            .from(equivalents)
            .where(
              and(
                eq(equivalents.partId, equivalent.partId),
                eq(equivalents.kind, equivalent.kind),
                eq(equivalents.maker, equivalent.maker),
                is(equivalents.reference, equivalent.reference ?? null),
              ),
            )
            .limit(1),
        'Equivalent',
      );
      return { id: row.id, created };
    },

    /**
     * **Sources have no unique constraint, deliberately** — the same shop at two prices on two
     * dates is a price history, which is exactly what a member wants. So the sameness a re-run
     * needs is decided here instead: the same offer at the same price on the same day is the
     * row that is already there.
     */
    async findOrAddSource(source) {
      const [existing] = await session
        .select()
        .from(sources)
        .where(
          and(
            eq(sources.partId, source.partId),
            eq(sources.name, source.name),
            eq(sources.url, source.url),
            is(sources.priceAmount, source.priceAmount ?? null),
            is(sources.observedOn, source.observedOn ?? null),
          ),
        )
        .limit(1);

      if (existing) {
        return { id: existing.id, created: false };
      }

      const [added] = await session.insert(sources).values(source).returning();
      return { id: expected(added, 'Source').id, created: true };
    },

    async findOrAddSubAssembly(tavolaId, name) {
      const { row, created } = await addOrFind(
        () =>
          session
            .insert(subAssemblies)
            .values({ tavolaId, name })
            .onConflictDoNothing({ target: [subAssemblies.tavolaId, subAssemblies.name] })
            .returning(),
        () =>
          session
            .select()
            .from(subAssemblies)
            .where(and(eq(subAssemblies.tavolaId, tavolaId), eq(subAssemblies.name, name)))
            .limit(1),
        'Sub-assembly',
      );
      return { id: row.id, created };
    },

    async putInSubAssembly(positionId, subAssemblyId) {
      const [position] = await session
        .select()
        .from(positions)
        .where(eq(positions.id, positionId))
        .limit(1);
      const found = expected(position, 'Position');

      if (found.subAssemblyId === subAssemblyId) {
        return 'already in this group';
      }
      // A Position belongs to at most one group, and the archive does not decide which by
      // reading order: the second claim on it is reported rather than applied.
      if (found.subAssemblyId !== null) {
        return 'in another group';
      }

      await session.update(positions).set({ subAssemblyId }).where(eq(positions.id, positionId));
      return 'joined';
    },

    async relatePositions(positionId, otherPositionId) {
      // One link is one row, in ascending order — which the check constraint insists on, and
      // which is why a sheet that records the link from both ends records it once.
      const [first, second] =
        positionId < otherPositionId
          ? [positionId, otherPositionId]
          : [otherPositionId, positionId];

      const { row, created } = await addOrFind(
        () =>
          session
            .insert(relatedPositions)
            .values({ positionId: first, relatedPositionId: second })
            .onConflictDoNothing({
              target: [relatedPositions.positionId, relatedPositions.relatedPositionId],
            })
            .returning(),
        () =>
          session
            .select()
            .from(relatedPositions)
            .where(
              and(
                eq(relatedPositions.positionId, first),
                eq(relatedPositions.relatedPositionId, second),
              ),
            )
            .limit(1),
        'Related Position',
      );
      return { id: row.id, created };
    },

    async hasScan(tavolaId) {
      const [existing] = await session
        .select({ one: sql<number>`1` })
        .from(scans)
        .where(eq(scans.tavolaId, tavolaId))
        .limit(1);
      return existing !== undefined;
    },
  };
}

function expected<T>(row: T | undefined, what: string): T {
  if (!row) {
    throw new Error(`The migration could neither add nor find a ${what}.`);
  }
  return row;
}
