import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  ne,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { catalogNumberKey } from '../catalog/part-identity.js';
import {
  nameBeginsWith,
  numberBeginsWith,
  numberIsExactly,
  squashedNumber,
} from '../catalog/part-matching.js';
import type { DbSession } from '../db/client.js';
import { shownTavole } from './tavola-repository.js';
import {
  equivalents,
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
   * The Parts a set of Catalog Numbers names, **in one query rather than one a number** — because
   * the thing that asks is a paste of two hundred rows, and two hundred round trips to find out
   * which of them the archive already has is how a paste becomes a minute of waiting.
   *
   * Matched with the catalog's own spacing ignored, exactly as an Editor's lookup matches it: a
   * bracket stamped `26003150` and a catalog printing `260 03 150` are the same number, and a
   * paste that took them for two would record the duplicate the identity rule exists to prevent
   * (ADR 0001). The unique constraint cannot see that, because the two strings differ.
   */
  findPartsByCatalogNumbers(catalogNumbers: string[]): Promise<PartRow[]>;
  /**
   * A Part on its own, for a caller that is already inside a transaction and places the Listing
   * itself. `addPartWithListing` below is what everything else uses, and the reason it exists.
   */
  addPart(part: NewPartRow): Promise<PartRow>;
  /**
   * **What "this query names that Part" means, written once for everything that asks it.**
   *
   * Five fields and no more: the Catalog Number, the Disegno Origine, an Equivalent's reference,
   * and either name. The three numbers match with the printed spacing ignored — the catalog
   * prints `260 03 150` and the bracket is stamped `26003150` — and everything matches from the
   * beginning rather than from the middle, which is the spec's "exact and prefix matching".
   *
   * Two callers, one rule. A member's Search reaches it from the number in their hand, and an
   * Editor's lookup reaches it in order to list a Part the archive already has; they differ in
   * what they *report* about a match and not at all in what counts as one. Two implementations of
   * "match a number regardless of spacing" is exactly the inconsistency this product exists to
   * remove, so there is one.
   *
   * The prose is deliberately out of reach. Notes, Catalog Notes, descriptions and dimensions are
   * not searched (spec): matching a word inside them is free-text search, which is what "Postgres
   * only, no relevance ranking" rules out.
   */
  searchParts(query: string, limit: number, seesUnchecked: boolean): Promise<PartRow[]>;
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
  /**
   * Every other Tavola these Parts are listed on, in one query rather than one a Part — and
   * **only the Published ones, whoever is reading**: a Part's other sheets are where somebody
   * goes next, and an Unchecked sheet is not yet somewhere to send anybody (ADR 0016).
   */
  listElsewhere(partIds: string[], exceptTavolaId: string): Promise<ElsewhereRow[]>;
  /**
   * The same question with no *here* to be elsewhere of — every place these Parts are listed,
   * for a screen that arrived from a number rather than from a drawing.
   */
  listEverywhereListed(partIds: string[], seesUnchecked: boolean): Promise<ElsewhereRow[]>;
  /** Every Tavola these Parts are listed on, each named once. */
  listListedOn(partIds: string[], seesUnchecked: boolean): Promise<ListedOnRow[]>;
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

  /**
   * **Where a set of Parts is listed**, optionally minus the one sheet somebody is already
   * looking at.
   *
   * One query for the two questions, because they differ only in that clause. *Where else is this
   * used* is asked by a member reading a Position and has a *here* to exclude; *where is this at
   * all* is asked by a screen that arrived from a number and has none. Written twice, the two
   * would eventually order a Part's appearances differently depending on how the member got to
   * them, which is the same list disagreeing with itself.
   */
  function whereListed(partIds: string[], exceptTavolaId: string | null, seesUnchecked: boolean) {
    if (partIds.length === 0) {
      return Promise.resolve([]);
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
        .where(
          and(
            inArray(listings.partId, partIds),
            exceptTavolaId === null ? undefined : ne(listings.tavolaId, exceptTavolaId),
            shownTavole(seesUnchecked),
          ),
        )
        // The car first, then that car's catalog in the order it is printed — which is how
        // somebody who owns one of these would look through it. A Listing at no number sorts last
        // on its sheet, where the printed page puts what it could not give a number to.
        .orderBy(
          asc(models.brand),
          asc(models.name),
          sql`${tavole.numberSort} asc nulls last`,
          asc(tavole.number),
          sql`${positions.numberSort} asc nulls last`,
          sql`${positions.number} asc nulls last`,
        )
    );
  }

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

    async findPartsByCatalogNumbers(catalogNumbers) {
      const squashed = catalogNumbers.map(catalogNumberKey).filter((number) => number !== '');
      if (squashed.length === 0) {
        return [];
      }

      return db
        .select()
        .from(parts)
        .where(inArray(squashedNumber(parts.catalogNumber), squashed));
    },

    async addPart(part) {
      const [added] = await db.insert(parts).values(part).returning();
      if (!added) {
        throw new Error('Inserting a Part returned nothing.');
      }
      return added;
    },

    async searchParts(query, limit, seesUnchecked) {
      /** Whichever of the Part's own numbers a search matched, as a subquery can also ask it. */
      const referenceMatching = (how: (column: AnyPgColumn, query: string) => SQL) =>
        exists(
          db
            .select({ matched: sql`1` })
            .from(equivalents)
            .where(and(eq(equivalents.partId, parts.id), how(equivalents.reference, query))),
        );

      /**
       * **The query naming a number and no more of it** — whichever of the three numbers that is.
       *
       * All three, and not the Catalog Number alone: a member quoting a Disegno Origine out of a
       * letter, or the reference off a modern bearing, has typed something they already know just
       * as surely as one reading a catalog's first column. Promoting only one of the three would
       * make where the number came from decide how easy it is to find.
       */
      const exactly = or(
        numberIsExactly(parts.catalogNumber, query),
        numberIsExactly(parts.disegnoOrigine, query),
        referenceMatching(numberIsExactly),
      );

      /**
       * **A Part only an Unchecked Tavola lists is not there yet** for somebody who may not see
       * that Tavola. A Part listed nowhere is still found — it is in the archive, and has simply
       * not been placed — so this asks whether it is listed *only* where they cannot look.
       */
      const listedWhereTheyCanLook = or(
        notExists(
          db
            .select({ listed: sql`1` })
            .from(listings)
            .where(eq(listings.partId, parts.id)),
        ),
        exists(
          db
            .select({ listed: sql`1` })
            .from(listings)
            .innerJoin(tavole, eq(listings.tavolaId, tavole.id))
            .where(and(eq(listings.partId, parts.id), shownTavole(false))),
        ),
      );

      return (
        db
          .select()
          .from(parts)
          .where(
            and(
              seesUnchecked ? undefined : listedWhereTheyCanLook,
              or(
                numberBeginsWith(parts.catalogNumber, query),
                numberBeginsWith(parts.disegnoOrigine, query),
                // **The reverse lookup**, and the reason it is a subquery rather than a join: a
                // Part with four matching Equivalents is one Part, and joining would report it four
                // times. Which of them matched is a second question, asked of the Parts this found.
                referenceMatching(numberBeginsWith),
                nameBeginsWith(parts.nameEn, query),
                nameBeginsWith(parts.nameIt, query),
              ),
            ),
          )
          // **The number typed in full first, and this is not relevance ranking.** Nothing is
          // scored, weighted or tuned; one boolean — did the query name a number and no more of it
          // — lifts whatever it is true of, and everything below is the catalog's own order.
          // Somebody who typed a number typed something they already know, and a list that buried
          // it under everything beginning the same way would answer a question nobody asked.
          //
          // A Part with no number goes last within its group: an unnumbered Part is ordinary, and
          // putting the nulls first would open every answer with the least identifiable thing.
          .orderBy(
            sql`case when ${exactly} then 0 else 1 end`,
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

    listElsewhere(partIds, exceptTavolaId) {
      return whereListed(partIds, exceptTavolaId, false);
    },

    listEverywhereListed(partIds, seesUnchecked) {
      return whereListed(partIds, null, seesUnchecked);
    },

    async listListedOn(partIds, seesUnchecked) {
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
        .where(and(inArray(listings.partId, partIds), shownTavole(seesUnchecked)))
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
