import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
  listings,
  models,
  parts,
  positions,
  tavole,
  type ListingRow,
  type ModelRow,
  type NewListingRow,
  type NewPartRow,
  type PartRow,
  type PositionRow,
  type TavolaRow,
} from '../db/schema.js';

/**
 * Parts and the Listings that place them on drawings.
 *
 * They are one file for the same reason Positions and Marks are: a Listing on its own says
 * nothing a member could read — it is a quantity and a flag — and a Part on its own has no
 * *where*. What a screen wants is always the pair, so nothing here returns a bare Listing.
 */

/** A Listing as it is read: the component, and how many are fitted here. */
export interface ListingWithPart extends ListingRow {
  part: PartRow;
}

/**
 * Somewhere else the same Part is listed. The Model comes with it because a Tavola belongs to
 * exactly one (ADR 0002) and it may well not be the car the member is looking at — which is the
 * most interesting thing this answer has to say.
 */
export interface ElsewhereRow {
  partId: string;
  listing: ListingRow;
  tavola: TavolaRow;
  model: ModelRow;
  position: PositionRow | null;
}

/**
 * One line of a Tavola's index: what is listed, and at which number. The Position travels with
 * it — and may be absent, which is a Part the catalog names on the sheet without anybody having
 * decided where on it that Part sits.
 */
export interface ListingOnTavola extends ListingWithPart {
  position: PositionRow | null;
}

export interface PartRepository {
  findPart(id: string): Promise<PartRow | null>;
  findPartByCatalogNumber(catalogNumber: string): Promise<PartRow | null>;
  /**
   * A new Part and its first Listing, **in one transaction**.
   *
   * They are one write because a Part that got recorded and then not listed would keep its
   * Catalog Number for nothing — and that number is unique across the archive, so the Editor's
   * next attempt would be refused and pointed at a phantom Part listed nowhere. That is exactly
   * the dishonesty the identity rule exists to prevent (ADR 0001), arrived at by accident.
   */
  addPartWithListing(
    part: NewPartRow,
    listing: Omit<NewListingRow, 'partId'>,
  ): Promise<{ part: PartRow; listing: ListingRow }>;

  listAtPosition(positionId: string): Promise<ListingWithPart[]>;
  /** Everything listed on one sheet, in the order the factory printed its numbers. */
  listOnTavola(tavolaId: string): Promise<ListingOnTavola[]>;
  /** Every other Tavola these Parts are listed on, in one query rather than one a Part. */
  listElsewhere(partIds: string[], exceptTavolaId: string): Promise<ElsewhereRow[]>;
  addListing(row: NewListingRow): Promise<ListingRow>;
  removeListing(id: string): Promise<boolean>;
}

export function createPartRepository(db: Db): PartRepository {
  /**
   * **Drawn first, and that is the archive's rule rather than the browser's.**
   *
   * The drawn Listings are the alternatives — what the Position's number actually points at —
   * and the undrawn ones are the fixings needed as well. Within each, the catalog's own number
   * orders them, and a Part that has none goes last: an unnumbered Part is ordinary, and putting
   * the nulls first would open every Position with the least identifiable thing on it.
   */
  const byWhatIsDrawnFirst = [
    desc(listings.drawn),
    sql`${parts.catalogNumber} asc nulls last`,
    sql`${parts.nameEn} asc nulls last`,
    asc(parts.id),
  ];

  return {
    async findPart(id) {
      const [row] = await db.select().from(parts).where(eq(parts.id, id)).limit(1);
      return row ?? null;
    },

    async findPartByCatalogNumber(catalogNumber) {
      const [row] = await db
        .select()
        .from(parts)
        .where(eq(parts.catalogNumber, catalogNumber))
        .limit(1);
      return row ?? null;
    },

    addPartWithListing(part, listing) {
      return db.transaction(async (transaction) => {
        const [recorded] = await transaction.insert(parts).values(part).returning();
        if (!recorded) {
          throw new Error('Inserting a Part returned nothing.');
        }

        const [placed] = await transaction
          .insert(listings)
          .values({ ...listing, partId: recorded.id })
          .returning();
        if (!placed) {
          throw new Error('Inserting a Listing returned nothing.');
        }

        return { part: recorded, listing: placed };
      });
    },

    async listAtPosition(positionId) {
      const rows = await db
        .select({ listing: listings, part: parts })
        .from(listings)
        .innerJoin(parts, eq(listings.partId, parts.id))
        .where(eq(listings.positionId, positionId))
        .orderBy(...byWhatIsDrawnFirst);

      return rows.map((row) => ({ ...row.listing, part: row.part }));
    },

    async listOnTavola(tavolaId) {
      const rows = await db
        .select({ listing: listings, part: parts, position: positions })
        .from(listings)
        .innerJoin(parts, eq(listings.partId, parts.id))
        .leftJoin(positions, eq(listings.positionId, positions.id))
        .where(eq(listings.tavolaId, tavolaId))
        // **The catalog's own order, and the browser never sorts a catalog** — the same rule the
        // sheet's Positions are read in, so the index beside the drawing and the numbers under it
        // cannot disagree. A Listing at no number at all sorts last, where the printed page puts
        // the things it could not give a number to.
        .orderBy(
          sql`${positions.numberSort} asc nulls last`,
          sql`${positions.number} asc nulls last`,
          ...byWhatIsDrawnFirst,
        );

      return rows.map((row) => ({ ...row.listing, part: row.part, position: row.position }));
    },

    async listElsewhere(partIds, exceptTavolaId) {
      if (partIds.length === 0) {
        return [];
      }

      return (
        db
          .select({
            partId: listings.partId,
            listing: listings,
            tavola: tavole,
            model: models,
            position: positions,
          })
          .from(listings)
          .innerJoin(tavole, eq(listings.tavolaId, tavole.id))
          .innerJoin(models, eq(tavole.modelId, models.id))
          .leftJoin(positions, eq(listings.positionId, positions.id))
          .where(and(inArray(listings.partId, partIds), ne(listings.tavolaId, exceptTavolaId)))
          // The car first, then that car's catalog in the order it is printed — which is how
          // somebody who owns one of these would look through it.
          .orderBy(
            asc(models.brand),
            asc(models.name),
            sql`${tavole.numberSort} asc nulls last`,
            asc(tavole.number),
            sql`${positions.numberSort} asc nulls last`,
          )
      );
    },

    async addListing(row) {
      const [listing] = await db.insert(listings).values(row).returning();
      if (!listing) {
        throw new Error('Inserting a Listing returned nothing.');
      }
      return listing;
    },

    async removeListing(id) {
      const removed = await db.delete(listings).where(eq(listings.id, id)).returning();
      return removed.length > 0;
    },
  };
}
