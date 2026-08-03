import type { NewPartRequest, PartListing, TavolaListing } from '@ricambi/contracts';
import { violates } from '../db/constraints.js';
import { ConflictError, NotFoundError } from '../http/errors.js';
import type { NewListingRow } from '../db/schema.js';
import type { ElsewhereRow, PartRepository } from '../repositories/part-repository.js';
import type { PositionRepository } from '../repositories/position-repository.js';
import type { TavolaRepository } from '../repositories/tavola-repository.js';
import { toPart, toPartListing, toTavolaListing } from './catalog-view.js';

/**
 * What sits at a number on a drawing.
 *
 * **A Part is a thing in its own right and a Listing is where it turns up** (ADR 0001). That
 * separation is the whole of this file: the same washer is one Part listed on six sheets with a
 * different count on each, rather than six near-identical rows that drift apart. The rule that
 * keeps it true is the Catalog Number — unique when present — and the moment it is enforced is
 * the moment an Editor is told they are describing something the archive already has.
 *
 * That refusal is **not** an error to be routed around. It is the deduplication mechanism, and
 * it carries the existing Part so the Editor can merge into it or correct what they typed.
 */

/**
 * A Part as an Editor typed it, already narrowed: blank fields have become absent ones.
 *
 * Derived from the wire shape rather than written out a second time — the two differ only in
 * that "" has become `null` on the way in, and a Part that gained a field on one of them and not
 * the other would be a field the archive quietly dropped.
 */
export type NewPart = { [Field in keyof NewPartRequest]: string | null };

/** Placing a Part on a drawing: an existing one by id, or a new one described in full. */
export interface NewListing {
  positionId: string | null;
  quantityPerCar: number | null;
  drawn: boolean;
  partId?: string | undefined;
  part?: NewPart | undefined;
}

export interface PartService {
  listingsAt(positionId: string): Promise<PartListing[]>;
  /** The whole sheet's text, for a member working from the list rather than from the drawing. */
  listingsOn(tavolaId: string): Promise<TavolaListing[]>;
  record(tavolaId: string, listing: NewListing): Promise<PartListing>;
  removeListing(listingId: string): Promise<void>;
}

export function createPartService(dependencies: {
  tavolaRepository: TavolaRepository;
  positionRepository: PositionRepository;
  partRepository: PartRepository;
}): PartService {
  const { tavolaRepository, positionRepository, partRepository } = dependencies;

  /**
   * The other Tavole a set of Parts appears on, read once for the whole Position rather than
   * once per Part. A Position carrying two alternatives and three fixings is five Parts, and
   * five round trips to answer one click is how a screen becomes slow without anybody deciding.
   */
  async function elsewhereFor(
    partIds: string[],
    exceptTavolaId: string,
  ): Promise<Map<string, ElsewhereRow[]>> {
    const rows = await partRepository.listElsewhere(partIds, exceptTavolaId);

    const byPart = new Map<string, ElsewhereRow[]>();
    for (const row of rows) {
      const found = byPart.get(row.partId);
      if (found) {
        found.push(row);
      } else {
        byPart.set(row.partId, [row]);
      }
    }
    return byPart;
  }

  /** The Position a Listing names, checked against the sheet it is being recorded on. */
  async function positionOn(tavolaId: string, positionId: string) {
    const position = await positionRepository.findById(positionId);
    // A Position belongs to one Tavola, and a Listing that crossed sheets would put a Part on a
    // drawing it is not on. Answered as "no such Position", because on this sheet there is none.
    if (!position || position.tavolaId !== tavolaId) {
      throw new NotFoundError('No such Position on this Tavola.');
    }
    return position;
  }

  /**
   * The write itself: a Part named, or a Part described and recorded with its first Listing.
   *
   * The two arrive as one request and are exclusive — the controller has already refused a
   * request that is neither or both — so this branches on which came rather than re-deciding it.
   * The second case is one transaction, for the reason the repository sets out: a Part recorded
   * without its Listing would keep a Catalog Number nothing is listed under.
   */
  async function place(listing: NewListing, at: Omit<NewListingRow, 'partId'>) {
    if (listing.part) {
      return partRepository.addPartWithListing(listing.part, at);
    }

    const part = listing.partId ? await partRepository.findPart(listing.partId) : null;
    if (!part) {
      throw new NotFoundError('No such Part.');
    }
    return { part, listing: await partRepository.addListing({ ...at, partId: part.id }) };
  }

  /**
   * What the database refused, said in words an Editor can act on.
   *
   * **Both refusals are read after the fact rather than checked before it**, because the database
   * is what decides: two Editors typing the same Catalog Number at the same moment cannot both
   * pass a check and both write. The Catalog Number one carries the Part that already holds the
   * number, since the collision is how the archive deduplicates and an Editor cannot merge into
   * something they have not been shown (ADR 0001).
   */
  async function refusalFor(error: unknown, listing: NewListing): Promise<never> {
    if (violates(error, 'listings_part_id_tavola_id_position_id_unique')) {
      throw new ConflictError('That Part is already listed at this Position.');
    }

    // The same thing said for a Listing that names no Position, which is a separate index
    // because Postgres counts two NULLs as different and the constraint above cannot reach it.
    if (violates(error, 'listings_unplaced_part_unique')) {
      throw new ConflictError('That Part is already listed on this Tavola, without a Position.');
    }

    const number = listing.part?.catalogNumber;
    if (violates(error, 'parts_catalog_number_unique') && number) {
      const existing = await partRepository.findPartByCatalogNumber(number);
      throw new ConflictError(
        `Catalog number ${number} is already recorded. Merge into that Part, or correct the number.`,
        existing ? { part: toPart(existing) } : undefined,
      );
    }

    throw error;
  }

  return {
    async listingsAt(positionId) {
      const position = await positionRepository.findById(positionId);
      if (!position) {
        throw new NotFoundError('No such Position.');
      }

      const rows = await partRepository.listAtPosition(positionId);
      const elsewhere = await elsewhereFor(
        rows.map((row) => row.partId),
        position.tavolaId,
      );

      return rows.map((row) => toPartListing(row, elsewhere.get(row.partId) ?? []));
    },

    async listingsOn(tavolaId) {
      if (!(await tavolaRepository.exists(tavolaId))) {
        throw new NotFoundError('No such Tavola.');
      }

      // No "elsewhere" here, deliberately. Where else a Part turns up is what a member asks about
      // the one they have picked, and answering it for every line of the index would be a query
      // per Part to draw a table of contents.
      return (await partRepository.listOnTavola(tavolaId)).map(toTavolaListing);
    },

    async record(tavolaId, listing) {
      if (!(await tavolaRepository.exists(tavolaId))) {
        throw new NotFoundError('No such Tavola.');
      }
      if (listing.positionId !== null) {
        await positionOn(tavolaId, listing.positionId);
      }

      const recorded = await place(listing, {
        tavolaId,
        positionId: listing.positionId,
        quantityPerCar: listing.quantityPerCar,
        drawn: listing.drawn,
      }).catch((error: unknown) => refusalFor(error, listing));

      const elsewhere = await elsewhereFor([recorded.part.id], tavolaId);
      return toPartListing(
        { ...recorded.listing, part: recorded.part },
        elsewhere.get(recorded.part.id) ?? [],
      );
    },

    async removeListing(listingId) {
      if (!(await partRepository.removeListing(listingId))) {
        throw new NotFoundError('No such Listing.');
      }
      // The Part stays. It is a component in its own right (ADR 0001), and it may well be
      // listed on five other drawings — removing one appearance is not removing the thing.
    },
  };
}
