import type { MarkPoint, RelatedPosition, Sheet } from '@ricambi/contracts';
import { violates } from '../db/constraints.js';
import { ConflictError, NotFoundError, ValidationError } from '../http/errors.js';
import type { PositionRepository, PositionWithMarks } from '../repositories/position-repository.js';
import type { TavolaRepository } from '../repositories/tavola-repository.js';
import type { SampleService } from './sample-service.js';
import { toPosition, toSubAssembly } from './catalog-view.js';

/**
 * Marking up a Tavola, and saying what belongs with each number once it is on there.
 *
 * **This is the project's critical path**, and the shape below is the consequence: a Tavola can
 * carry over two hundred Positions, there are hundreds of Tavole, and all of it is volunteers'
 * evenings. So placing a Mark is *one* request that finds or records the Position and puts the
 * circle on it — not a lookup, then a create, then a place. An Editor clicking through a sheet
 * pays one round trip a circle and nothing else.
 *
 * Nothing here has an opinion about what sits at a Position. That is a Listing, and a Position
 * that never gets one is finished rather than abandoned. What *is* here beyond the circles is
 * what belongs with a number rather than at it — the Sub-assembly it sits in, and the numbers it
 * has been linked to. Both are properties of the sheet and of no Part, which is why they live
 * beside the Positions and not beside the Listings.
 */

/**
 * Every write answers with the sheet as it now stands, so nothing outside this file ever has an
 * opinion about the order a catalog's numbers go in — or about which Sub-assemblies still exist,
 * which a membership change can decide on its own.
 */
export interface PositionService {
  listForTavola(tavolaId: string): Promise<Sheet>;
  /** One click: the Position that number names, with the new circle on it. */
  placeMark(tavolaId: string, number: string, at: MarkPoint): Promise<Sheet>;
  /** A number the catalog lists but the drawing does not show. */
  addPosition(tavolaId: string, number: string): Promise<{ sheet: Sheet; added: boolean }>;
  removePosition(positionId: string): Promise<Sheet>;
  moveMark(markId: string, to: MarkPoint): Promise<Sheet>;
  removeMark(markId: string): Promise<Sheet>;

  /** Putting numbers into a named Sub-assembly — one the sheet already has, or a new one. */
  putInSubAssembly(tavolaId: string, name: string, positionIds: string[]): Promise<Sheet>;
  takeOutOfSubAssembly(positionId: string): Promise<Sheet>;
  dissolveSubAssembly(subAssemblyId: string): Promise<Sheet>;
  /**
   * Where a Sub-assembly is on the drawing: drawn, replaced, or removed with `null`. The corners
   * are checked on the way in; this only writes them.
   */
  outlineSubAssembly(subAssemblyId: string, corners: MarkPoint[] | null): Promise<Sheet>;

  /** The narrow pointer: two numbers on one sheet, recorded once and read from both ends. */
  relate(tavolaId: string, positionId: string, otherPositionId: string): Promise<Sheet>;
  unrelate(linkId: string): Promise<Sheet>;
}

export function createPositionService(dependencies: {
  tavolaRepository: TavolaRepository;
  positionRepository: PositionRepository;
  /** A Sample whose open number is removed ends with it (issue #130). */
  sampleService: Pick<SampleService, 'removingPosition'>;
}): PositionService {
  const { tavolaRepository, positionRepository, sampleService } = dependencies;

  /**
   * **The whole sheet, re-read** — every number on it, what each is linked to, and the groups
   * that still have numbers in them.
   */
  async function sheet(tavolaId: string): Promise<Sheet> {
    const [rows, links, groups] = await Promise.all([
      positionRepository.listByTavola(tavolaId),
      positionRepository.listRelatedOnTavola(tavolaId),
      positionRepository.listSubAssemblies(tavolaId),
    ]);

    const related = relatedByPosition(rows, links);
    return {
      positions: rows.map((row) => toPosition(row, related.get(row.id) ?? [])),
      subAssemblies: groups.map(toSubAssembly),
    };
  }

  /**
   * A link is one row and two Positions, so this turns each row into the *other end* of it, once
   * for each end.
   *
   * The lists come out in the catalog's own order for free: the sheet is already in that order,
   * and walking it once appending each number to whatever it is linked to is what puts every
   * list in it. Sorting them afterwards would be the archive deciding a catalog's order twice.
   */
  function relatedByPosition(
    rows: PositionWithMarks[],
    links: { id: string; positionId: string; relatedPositionId: string }[],
  ): Map<string, RelatedPosition[]> {
    /** For each number, the links whose *other* end it is. */
    const linksTo = new Map<string, { id: string; ownerId: string }[]>();
    const note = (endId: string, ownerId: string, id: string) => {
      const found = linksTo.get(endId);
      if (found) {
        found.push({ id, ownerId });
      } else {
        linksTo.set(endId, [{ id, ownerId }]);
      }
    };

    for (const link of links) {
      note(link.relatedPositionId, link.positionId, link.id);
      note(link.positionId, link.relatedPositionId, link.id);
    }

    const related = new Map<string, RelatedPosition[]>();
    for (const candidate of rows) {
      for (const link of linksTo.get(candidate.id) ?? []) {
        const found = related.get(link.ownerId);
        const entry = { id: link.id, positionId: candidate.id };
        if (found) {
          found.push(entry);
        } else {
          related.set(link.ownerId, [entry]);
        }
      }
    }
    return related;
  }

  /** The sheet a Mark is on, which is what every correction has to answer with. */
  async function sheetOfPosition(positionId: string): Promise<Sheet> {
    return sheet(await tavolaOfPosition(positionId));
  }

  async function tavolaOfPosition(positionId: string): Promise<string> {
    const position = await positionRepository.findById(positionId);
    if (!position) {
      throw new NotFoundError('No such Position.');
    }
    return position.tavolaId;
  }

  /**
   * The Positions those ids name, **checked against the sheet they are being recorded on**. A
   * Sub-assembly or a link reaching across drawings would be a claim about two sheets that
   * neither of them could show, so it is refused as a number this sheet does not have.
   */
  async function positionsOn(tavolaId: string, positionIds: string[]) {
    const found = await Promise.all(positionIds.map((id) => positionRepository.findById(id)));

    return found.map((position) => {
      if (!position || position.tavolaId !== tavolaId) {
        throw new NotFoundError('No such Position on this Tavola.');
      }
      return position;
    });
  }

  async function tavolaThatExists(tavolaId: string): Promise<void> {
    if (!(await tavolaRepository.exists(tavolaId))) {
      throw new NotFoundError('No such Tavola.');
    }
  }

  async function findOrAdd(tavolaId: string, number: string) {
    await tavolaThatExists(tavolaId);

    return positionRepository.findOrAdd({ tavolaId, number });
  }

  return {
    listForTavola: sheet,

    async placeMark(tavolaId, number, at) {
      const { position } = await findOrAdd(tavolaId, number);
      await positionRepository.addMark({ positionId: position.id, x: at.x, y: at.y });
      return sheet(tavolaId);
    },

    async addPosition(tavolaId, number) {
      const { added } = await findOrAdd(tavolaId, number);
      return { sheet: await sheet(tavolaId), added };
    },

    async removePosition(positionId) {
      const tavolaId = await tavolaOfPosition(positionId);
      try {
        await sampleService.removingPosition(positionId, async () => {
          await positionRepository.remove(positionId);
        });
      } catch (error) {
        if (violates(error, 'contributions_position_id_positions_id_fk')) {
          // Marks and links go with the number; what a member wrote about it does not.
          throw new ConflictError(
            'Members have written Contributions about this number. It stays while they do.',
          );
        }
        throw error;
      }
      // A number taken off the sheet takes its links with it — the rows cascade — and may have
      // been the last one in its Sub-assembly, which then has nothing left to be a name for.
      await positionRepository.removeEmptySubAssemblies(tavolaId);
      return sheet(tavolaId);
    },

    async moveMark(markId, to) {
      const moved = await positionRepository.moveMark(markId, to);
      if (!moved) {
        throw new NotFoundError('No such Mark.');
      }
      return sheetOfPosition(moved.positionId);
    },

    async removeMark(markId) {
      const removed = await positionRepository.removeMark(markId);
      if (!removed) {
        throw new NotFoundError('No such Mark.');
      }
      // The Position stays. A number with no circle left on it is "listed but not drawn",
      // which is an ordinary thing for a Position to be and not a row to tidy away.
      return sheetOfPosition(removed.positionId);
    },

    async putInSubAssembly(tavolaId, name, positionIds) {
      await tavolaThatExists(tavolaId);
      // Every number is checked before anything is written, so a Sub-assembly naming one number
      // from another sheet leaves nothing behind on the way to being refused.
      await positionsOn(tavolaId, positionIds);

      // The name is what decides which Sub-assembly this is: a sheet has one *Door Lock*, and
      // typing it again puts these numbers into that one rather than beside it.
      await positionRepository.putInSubAssembly(tavolaId, name, positionIds);
      return sheet(tavolaId);
    },

    async takeOutOfSubAssembly(positionId) {
      const position = await positionRepository.takeOutOfSubAssembly(positionId);
      if (!position) {
        throw new NotFoundError('No such Position.');
      }
      return sheet(position.tavolaId);
    },

    async dissolveSubAssembly(subAssemblyId) {
      const removed = await positionRepository.removeSubAssembly(subAssemblyId);
      if (!removed) {
        throw new NotFoundError('No such Sub-assembly.');
      }
      // The numbers stay where they are, in no Sub-assembly. Dissolving a name is not deleting
      // what it was a name for.
      return sheet(removed.tavolaId);
    },

    async outlineSubAssembly(subAssemblyId, corners) {
      const written = await positionRepository.writeSubAssemblyOutline(subAssemblyId, corners);
      if (!written) {
        throw new NotFoundError('No such Sub-assembly.');
      }
      return sheet(written.tavolaId);
    },

    async relate(tavolaId, positionId, otherPositionId) {
      await tavolaThatExists(tavolaId);
      if (positionId === otherPositionId) {
        throw new ValidationError('A number cannot be related to itself.');
      }
      await positionsOn(tavolaId, [positionId, otherPositionId]);

      await positionRepository.relate(positionId, otherPositionId).catch((error: unknown) => {
        // Read after the fact rather than checked before it, because the database is what
        // decides — and it decides on the *pair*, whichever way round the two ids arrived.
        if (violates(error, 'related_positions_pair_unique')) {
          throw new ConflictError(
            'Those two numbers are already linked. The link is recorded once and shows on both.',
          );
        }
        throw error;
      });

      return sheet(tavolaId);
    },

    async unrelate(linkId) {
      const removed = await positionRepository.removeRelated(linkId);
      if (!removed) {
        throw new NotFoundError('No such link.');
      }
      // One row, so removing it removes it from both ends — which is the same fact that made
      // recording it once enough.
      return sheetOfPosition(removed.positionId);
    },
  };
}
