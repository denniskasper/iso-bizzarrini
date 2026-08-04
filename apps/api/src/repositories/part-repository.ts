import { and, asc, count, desc, eq, inArray, ne, notExists, or, sql } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
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

/**
 * A sheet a Part is listed on. **One row per Tavola however many numbers the Part sits at on
 * it**, which is what tells an Editor how far a correction to the Part reaches — a washer at four
 * numbers on one drawing changes one drawing.
 */
export interface ListedOnRow {
  partId: string;
  tavola: TavolaRow;
  model: ModelRow;
}

/** The editable fields of a Part: the nine an Editor typed, and never its identity. */
export type PartFields = Omit<NewPartRow, 'id'>;

/** The three fields a Listing has of its own. Which Part it is remains what it was. */
export type ListingFields = Pick<NewListingRow, 'positionId' | 'quantityPerCar' | 'drawn'>;

export interface PartRepository {
  findPart(id: string): Promise<PartRow | null>;
  findPartByCatalogNumber(catalogNumber: string): Promise<PartRow | null>;
  /**
   * **An Editor's lookup, and deliberately not Search.** A Catalog Number matched exactly with
   * the printed spacing ignored, or a prefix of either name — enough to find a Part in order to
   * list it somewhere else. Ticket 22 owns Search and reaches further; when it lands it should
   * absorb this rather than stand beside it, because two implementations of "match a number
   * regardless of spacing" is exactly the inconsistency this product exists to remove.
   */
  lookUpParts(query: string, limit: number): Promise<PartRow[]>;
  /** Correcting the Part itself, which corrects it wherever it is listed (ADR 0001). */
  updatePart(id: string, fields: PartFields): Promise<PartRow | null>;
  /**
   * Removing the Part, **and only while nothing lists it** — a condition this write carries
   * rather than trusting a caller to have checked. `false` means it did not go, which is either
   * a Part that was never there or one something still lists; telling those apart is a question
   * about how to say no, and belongs to whoever is answering.
   */
  removePart(id: string): Promise<boolean>;
  /** How many Listings hold this Part — what stands between it and being removed. */
  countListings(partId: string): Promise<number>;
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
  /** Every Tavola these Parts are listed on, each named once. */
  listListedOn(partIds: string[]): Promise<ListedOnRow[]>;
  addListing(row: NewListingRow): Promise<ListingRow>;
  findListing(id: string): Promise<ListingRow | null>;
  /**
   * Correcting a Listing answers with the row **as it now is**, and never with a bare boolean:
   * what this write has to produce afterwards is the Listing as it will be read, and the row is
   * the only thing that knows which Part and which sheet that is.
   */
  updateListing(id: string, fields: ListingFields): Promise<ListingRow | null>;
  removeListing(id: string): Promise<boolean>;
}

/**
 * A Catalog Number with the catalog's own spacing taken out of it, said in SQL.
 *
 * The catalog prints `260 03 150`; the bracket in somebody's hand is stamped `26003150`. Both are
 * the same number and an Editor should not have to guess which the archive was given, so both
 * sides of the comparison are squashed. It is deliberately **not** indexed: this archive holds a
 * few thousand Parts, and the lookup is a debt ticket 22 is meant to absorb rather than a surface
 * to build on.
 */
const squashedCatalogNumber = sql`lower(regexp_replace(coalesce(${parts.catalogNumber}, ''), '[[:space:]]', '', 'g'))`;

/**
 * What was typed, as a prefix pattern — with `%` and `_` reduced to the characters they are.
 * Somebody looking for a part whose name has a percent sign in it is looking for that sign.
 */
function asPrefixPattern(query: string): string {
  return `${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

export function createPartRepository(db: DbSession): PartRepository {
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

    async lookUpParts(query, limit) {
      const squashed = query.replace(/\s+/g, '').toLowerCase();
      const byNumber = sql`${squashedCatalogNumber} = ${squashed}`;
      const prefix = asPrefixPattern(query);

      return (
        db
          .select()
          .from(parts)
          .where(
            or(
              byNumber,
              sql`${parts.nameEn} ilike ${prefix}`,
              sql`${parts.nameIt} ilike ${prefix}`,
            ),
          )
          // **The exact number first.** At most one Part can hold it, and an Editor who typed a
          // number typed the thing they already know; a list that buried it under everything whose
          // name happens to start the same way would be answering a question nobody asked.
          .orderBy(
            sql`case when ${byNumber} then 0 else 1 end`,
            sql`${parts.catalogNumber} asc nulls last`,
            sql`${parts.nameEn} asc nulls last`,
            asc(parts.id),
          )
          .limit(limit)
      );
    },

    async updatePart(id, fields) {
      const [updated] = await db.update(parts).set(fields).where(eq(parts.id, id)).returning();
      return updated ?? null;
    },

    async removePart(id) {
      const removed = await db
        .delete(parts)
        .where(
          and(
            eq(parts.id, id),
            // **The guard is in the statement, not in a read before it.** `listings.partId`
            // cascades from here, so a Part deleted while listed takes an evening's work off
            // sheets nobody is looking at — and a count read first, then acted on, leaves a
            // window in which a Listing recorded by another Editor is silently destroyed. One
            // statement cannot lose that race: the row goes only if nothing listed it at the
            // instant it went.
            notExists(
              db
                .select({ listed: sql`1` })
                .from(listings)
                .where(eq(listings.partId, id)),
            ),
          ),
        )
        .returning();
      return removed.length > 0;
    },

    async countListings(partId) {
      const [row] = await db
        .select({ listings: count() })
        .from(listings)
        .where(eq(listings.partId, partId));
      return row?.listings ?? 0;
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

    async listListedOn(partIds) {
      if (partIds.length === 0) {
        return [];
      }

      const rows = await db
        // **Distinct**, because the question is which *sheets* a correction reaches: a Part at
        // four numbers on one drawing is on one drawing, and four rows here would be an Editor
        // told a correction changes four sheets when it changes one.
        .selectDistinct({ partId: listings.partId, tavola: tavole, model: models })
        .from(listings)
        .innerJoin(tavole, eq(listings.tavolaId, tavole.id))
        .innerJoin(models, eq(tavole.modelId, models.id))
        .where(inArray(listings.partId, partIds))
        // The car first, then that car's catalog in the order it is printed.
        .orderBy(
          asc(models.brand),
          asc(models.name),
          sql`${tavole.numberSort} asc nulls last`,
          asc(tavole.number),
        );

      return rows;
    },

    async addListing(row) {
      const [listing] = await db.insert(listings).values(row).returning();
      if (!listing) {
        throw new Error('Inserting a Listing returned nothing.');
      }
      return listing;
    },

    async findListing(id) {
      const [row] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
      return row ?? null;
    },

    async updateListing(id, fields) {
      const [updated] = await db
        .update(listings)
        .set(fields)
        .where(eq(listings.id, id))
        .returning();
      return updated ?? null;
    },

    async removeListing(id) {
      const removed = await db.delete(listings).where(eq(listings.id, id)).returning();
      return removed.length > 0;
    },
  };
}
