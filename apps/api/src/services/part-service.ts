import type {
  FoundPart,
  NewPartRequest,
  PartListing,
  PartResponse,
  PartLookupResponse,
  TavolaListing,
} from '@ricambi/contracts';
import { violates } from '../db/constraints.js';
import { ConflictError, NotFoundError } from '../http/errors.js';
import type { ListingRow, NewListingRow } from '../db/schema.js';
import { byPart } from '../repositories/by-part.js';
import type { PartRecordRows } from '../repositories/part-record-repository.js';
import type { ElsewhereRow, ListedOnRow, PartRepository } from '../repositories/part-repository.js';
import type { PositionRepository } from '../repositories/position-repository.js';
import type { TavolaRepository } from '../repositories/tavola-repository.js';
import type { PartRecordService } from './part-record-service.js';
import {
  toListedOn,
  toPart,
  toPartInFull,
  toPartListing,
  toTavolaListing,
} from './catalog-view.js';

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

/** Correcting one: the three fields a Listing has of its own, all of them sent every time. */
export interface CorrectedListing {
  positionId: string | null;
  quantityPerCar: number | null;
  drawn: boolean;
}

/**
 * **How many matches an Editor's lookup reports**, and the reason there is a limit at all: a
 * prefix of a name is a broad thing to type, and a list of every washer in the archive is not an
 * answer. What is held back is reported rather than silently dropped, because a truncated list
 * read as a complete one is how a second copy of a Part gets recorded.
 */
const MOST_MATCHES_REPORTED = 20;

export interface PartService {
  listingsAt(positionId: string): Promise<PartListing[]>;
  /** The whole sheet's text, for a member working from the list rather than from the drawing. */
  listingsOn(tavolaId: string): Promise<TavolaListing[]>;
  record(tavolaId: string, listing: NewListing): Promise<PartListing>;
  correctListing(listingId: string, listing: CorrectedListing): Promise<PartListing>;
  removeListing(listingId: string): Promise<void>;

  /** The whole Part, and every sheet a correction to it would reach. */
  readPart(partId: string, seesUnchecked: boolean): Promise<PartResponse>;
  correctPart(partId: string, part: NewPart): Promise<PartResponse>;
  /**
   * An Editor vouching for the English name, as it stands or rewritten: it stops being a Machine
   * translation.
   */
  nameInEnglish(partId: string, nameEn: string): Promise<PartResponse>;
  /** Refused while anything still lists it — the Listings go first, deliberately. */
  removePart(partId: string): Promise<void>;
  lookUpParts(query: string, seesUnchecked: boolean): Promise<PartLookupResponse>;
}

export function createPartService(dependencies: {
  tavolaRepository: TavolaRepository;
  positionRepository: PositionRepository;
  partRepository: PartRepository;
  /**
   * What fits each Part, what replaces it and where it has been available. It arrives with the
   * Part rather than behind a second request, because a member weighing whether to order
   * something reads all of it in one glance at one panel — and it is read for the whole Position
   * at once, so five Parts at a number cost three queries rather than fifteen.
   */
  partRecordService: PartRecordService;
}): PartService {
  const { tavolaRepository, positionRepository, partRepository, partRecordService } = dependencies;

  const nothingRecorded: PartRecordRows = {
    specifications: [],
    fitments: [],
    equivalents: [],
    sources: [],
    photographs: [],
  };

  /**
   * The other Tavole a set of Parts appears on, read once for the whole Position rather than
   * once per Part. A Position carrying two alternatives and three fixings is five Parts, and
   * five round trips to answer one click is how a screen becomes slow without anybody deciding.
   */
  async function elsewhereFor(
    partIds: string[],
    exceptTavolaId: string,
  ): Promise<Map<string, ElsewhereRow[]>> {
    return byPart(await partRepository.listElsewhere(partIds, exceptTavolaId));
  }

  /**
   * The sheets a set of Parts is listed on, read once for the whole set — the same argument
   * `elsewhereFor` makes, for the question an Editor's lookup asks of every Part it found.
   */
  async function listedOnFor(
    partIds: string[],
    seesUnchecked: boolean,
  ): Promise<Map<string, ListedOnRow[]>> {
    return byPart(await partRepository.listListedOn(partIds, seesUnchecked));
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
   * The Part, or the plain refusal. Nothing is correctable or removable against something gone.
   */
  async function partThatExists(partId: string) {
    const part = await partRepository.findPart(partId);
    if (!part) {
      throw new NotFoundError('No such Part.');
    }
    return part;
  }

  /**
   * **The whole Part, and every sheet a correction to it would reach.**
   *
   * The two are read together because the second is what makes the first safe to change: a Part
   * is one thing (ADR 0001), so correcting it corrects it at every number it sits at on every
   * drawing — which is invisible from a screen showing one Position.
   */
  async function wholePart(partId: string, seesUnchecked: boolean): Promise<PartResponse> {
    const part = await partThatExists(partId);
    const [records, listedOn] = await Promise.all([
      partRecordService.recordsFor([partId]),
      partRepository.listListedOn([partId], seesUnchecked),
    ]);

    return {
      part: toPartInFull(part, records.get(partId) ?? nothingRecorded),
      listedOn: listedOn.map(toListedOn),
    };
  }

  /** One Listing as it will be read: the Part, what fits it, and wherever else it is. */
  async function readListing(row: ListingRow): Promise<PartListing> {
    const part = await partThatExists(row.partId);
    const [elsewhere, records] = await Promise.all([
      elsewhereFor([part.id], row.tavolaId),
      partRecordService.recordsFor([part.id]),
    ]);

    return toPartListing(
      { ...row, part },
      records.get(part.id) ?? nothingRecorded,
      elsewhere.get(part.id) ?? [],
    );
  }

  /**
   * What the database refused about *where* a Part sits, said in words an Editor can act on —
   * and nothing at all if this refusal was about something else.
   *
   * Read after the fact rather than checked before it, because the database is what decides: two
   * Editors placing the same Part at one number at the same moment cannot both pass a check and
   * both write.
   */
  function refuseAListingCollision(error: unknown): void {
    if (violates(error, 'listings_part_id_tavola_id_position_id_unique')) {
      throw new ConflictError('That Part is already listed at this Position.');
    }

    // The same thing said for a Listing that names no Position, which is a separate index
    // because Postgres counts two NULLs as different and the constraint above cannot reach it.
    if (violates(error, 'listings_unplaced_part_unique')) {
      throw new ConflictError('That Part is already listed on this Tavola, without a Position.');
    }
  }

  /**
   * **The refusal that is the deduplication mechanism rather than an obstacle** (ADR 0001).
   *
   * It carries the Part that already holds the number, because an Editor cannot merge into
   * something they have not been shown — and it is the same refusal whether the number was typed
   * onto a new Part or edited onto one the archive already had. The rule belongs to the archive,
   * not to the form.
   */
  async function catalogNumberRefusal(error: unknown, number: string | null): Promise<never> {
    if (violates(error, 'parts_catalog_number_unique') && number) {
      const existing = await partRepository.findPartByCatalogNumber(number);
      throw new ConflictError(
        `Catalog number ${number} is already recorded. Merge into that Part, or correct the number.`,
        existing ? { part: toPart(existing) } : undefined,
      );
    }

    throw error;
  }

  async function refusalFor(error: unknown, listing: NewListing): Promise<never> {
    refuseAListingCollision(error);
    return catalogNumberRefusal(error, listing.part?.catalogNumber ?? null);
  }

  return {
    async listingsAt(positionId) {
      const position = await positionRepository.findById(positionId);
      if (!position) {
        throw new NotFoundError('No such Position.');
      }

      const rows = await partRepository.listAtPosition(positionId);
      const partIds = rows.map((row) => row.partId);
      const [elsewhere, records] = await Promise.all([
        elsewhereFor(partIds, position.tavolaId),
        partRecordService.recordsFor(partIds),
      ]);

      return rows.map((row) =>
        toPartListing(
          row,
          records.get(row.partId) ?? nothingRecorded,
          elsewhere.get(row.partId) ?? [],
        ),
      );
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
      // A Part recorded a moment ago has none of the three yet, and a Part being listed a second
      // time has whatever it already had — both of which this reads rather than assumes.
      const records = await partRecordService.recordsFor([recorded.part.id]);
      return toPartListing(
        { ...recorded.listing, part: recorded.part },
        records.get(recorded.part.id) ?? nothingRecorded,
        elsewhere.get(recorded.part.id) ?? [],
      );
    },

    /**
     * A Listing an Editor got wrong: the quantity, the drawn flag, or the number it sits at.
     *
     * **Which Part it is is not among them.** Correcting the Part is `correctPart`, and a
     * Listing that could be pointed at a different Part would be a way of changing two records
     * with one press. What can change is where on *this* sheet it sits — including nowhere on it,
     * which is the state a Position removed out from under it leaves it in.
     */
    async correctListing(listingId, corrected) {
      const listing = await partRepository.findListing(listingId);
      if (!listing) {
        throw new NotFoundError('No such Listing.');
      }
      if (corrected.positionId !== null) {
        await positionOn(listing.tavolaId, corrected.positionId);
      }

      const updated = await partRepository
        .updateListing(listingId, corrected)
        .catch((error: unknown) => {
          refuseAListingCollision(error);
          throw error;
        });

      // It was there when this began, so it going missing now means another Editor removed it.
      if (!updated) {
        throw new NotFoundError('No such Listing.');
      }
      return readListing(updated);
    },

    async removeListing(listingId) {
      if (!(await partRepository.removeListing(listingId))) {
        throw new NotFoundError('No such Listing.');
      }
      // The Part stays. It is a component in its own right (ADR 0001), and it may well be
      // listed on five other drawings — removing one appearance is not removing the thing.
    },

    readPart: wholePart,

    /**
     * **Correcting the Part, which corrects it wherever it is listed.** That is ADR 0001
     * doing what it is for rather than a side effect, and it is why the answer carries the sheets
     * it reached.
     *
     * All nine fields arrive every time, so a value can be cleared as well as changed — a Part
     * whose Catalog Number turns out to belong to something else has to be able to go back to
     * having none, since "this Part has no factory number" is a legitimate state and not a gap.
     */
    async correctPart(partId, part) {
      const corrected = await partRepository
        .updatePart(partId, part)
        .catch((error: unknown) => catalogNumberRefusal(error, part.catalogNumber));

      if (!corrected) {
        throw new NotFoundError('No such Part.');
      }
      // Correcting is an Editor's, and reaches the Unchecked sheets as well.
      return wholePart(partId, true);
    },

    async nameInEnglish(partId, nameEn) {
      if (!(await partRepository.nameInEnglish(partId, nameEn))) {
        throw new NotFoundError('No such Part.');
      }
      return wholePart(partId, true);
    },

    /**
     * **Refused while anything still lists it, and that is the load-bearing part.**
     *
     * The Listings cascade from the Part, so removing one that is still listed would take an
     * evening's work off every sheet it appears on — including the ones the Editor is not looking
     * at and would never find out about. Making the Listings go first means each of those sheets
     * has been in front of somebody.
     */
    async removePart(partId) {
      await partThatExists(partId);

      // The write carries its own condition, so this is one statement and not a count acted on
      // afterwards: a Listing recorded by another Editor between the two would otherwise be
      // destroyed by the very rule that exists to protect it.
      let removed: boolean;
      try {
        removed = await partRepository.removePart(partId);
      } catch (error) {
        if (violates(error, 'contributions_part_id_parts_id_fk')) {
          // The one thing hung off a Part that does not go with it, because it is not the
          // archive's: a member wrote it, and it is decided before what it is about is removed.
          throw new ConflictError(
            'Members have written Contributions about this Part. It stays while they do.',
          );
        }
        throw error;
      }
      if (removed) {
        return;
      }

      // It was there a moment ago and it did not go, so say which of the two reasons that was.
      const listed = await partRepository.countListings(partId);
      if (listed === 0) {
        throw new NotFoundError('No such Part.');
      }
      throw new ConflictError(
        listed === 1
          ? 'This Part is still listed on a drawing. Remove that listing first.'
          : `This Part is still listed in ${listed} places. Remove those listings first — nothing here removes work from a sheet you are not looking at.`,
      );
    },

    /**
     * **An Editor's tool for listing a Part the archive already has**, and the only thing that
     * can see a Part listed nowhere.
     *
     * It matches through the archive's one matching rule, which ticket 22 widened to the five
     * fields a member searches — so a Part is found here by its Disegno Origine or by a supplier's
     * number as readily as by its Catalog Number. What is different from Search is only what is
     * *reported*: this answers how far a correction reaches, in sheets, because that is what an
     * Editor about to make one is deciding on.
     *
     * One more than will be reported is read, so that a capped list can say it is one. An Editor
     * told "no such Part" by a truncated answer records a second copy of the Part the answer
     * did not reach.
     */
    async lookUpParts(query, seesUnchecked) {
      const found = await partRepository.searchParts(
        query,
        MOST_MATCHES_REPORTED + 1,
        seesUnchecked,
      );
      const reported = found.slice(0, MOST_MATCHES_REPORTED);

      const listedOn = await listedOnFor(
        reported.map((part) => part.id),
        seesUnchecked,
      );
      return {
        parts: reported.map((row): FoundPart => ({
          part: toPart(row),
          listedOn: (listedOn.get(row.id) ?? []).map(toListedOn),
        })),
        more: found.length > reported.length,
      };
    },
  };
}
