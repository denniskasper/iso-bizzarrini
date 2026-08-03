import type { MarkPoint, Position } from '@ricambi/contracts';
import { numericPrefixOf } from '../catalog/naming.js';
import { NotFoundError } from '../http/errors.js';
import type { PositionRepository } from '../repositories/position-repository.js';
import type { TavolaRepository } from '../repositories/tavola-repository.js';
import { toPosition } from './catalog-view.js';

/**
 * Marking up a Tavola.
 *
 * **This is the project's critical path**, and the shape below is the consequence: a Tavola can
 * carry over two hundred Positions, there are hundreds of Tavole, and all of it is volunteers'
 * evenings. So placing a Mark is *one* request that finds or records the Position and puts the
 * circle on it — not a lookup, then a create, then a place. An Editor clicking through a sheet
 * pays one round trip a circle and nothing else.
 *
 * Nothing here has an opinion about what sits at a Position. That is a Listing, it arrives with
 * ticket 06, and a Position that never gets one is finished rather than abandoned.
 */

/**
 * Every write answers with the sheet as it now stands, so nothing outside this file ever has an
 * opinion about the order a catalog's numbers go in.
 */
export interface PositionService {
  listForTavola(tavolaId: string): Promise<Position[]>;
  /** One click: the Position that number names, with the new circle on it. */
  placeMark(tavolaId: string, number: string, at: MarkPoint): Promise<Position[]>;
  /** A number the catalog lists but the drawing does not show. */
  addPosition(tavolaId: string, number: string): Promise<{ positions: Position[]; added: boolean }>;
  removePosition(positionId: string): Promise<Position[]>;
  moveMark(markId: string, to: MarkPoint): Promise<Position[]>;
  removeMark(markId: string): Promise<Position[]>;
}

export function createPositionService(dependencies: {
  tavolaRepository: TavolaRepository;
  positionRepository: PositionRepository;
}): PositionService {
  const { tavolaRepository, positionRepository } = dependencies;

  async function sheet(tavolaId: string): Promise<Position[]> {
    return (await positionRepository.listByTavola(tavolaId)).map(toPosition);
  }

  /** The sheet a Mark is on, which is what every correction has to answer with. */
  async function sheetOfPosition(positionId: string): Promise<Position[]> {
    const position = await positionRepository.findById(positionId);
    if (!position) {
      throw new NotFoundError('No such Position.');
    }
    return sheet(position.tavolaId);
  }

  async function findOrAdd(tavolaId: string, number: string) {
    if (!(await tavolaRepository.exists(tavolaId))) {
      throw new NotFoundError('No such Tavola.');
    }

    return positionRepository.findOrAdd({
      tavolaId,
      number,
      numberSort: numericPrefixOf(number),
    });
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
      return { positions: await sheet(tavolaId), added };
    },

    async removePosition(positionId) {
      const position = await positionRepository.findById(positionId);
      if (!position) {
        throw new NotFoundError('No such Position.');
      }
      await positionRepository.remove(positionId);
      return sheet(position.tavolaId);
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
  };
}
