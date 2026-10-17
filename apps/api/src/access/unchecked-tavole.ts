import type { RequestParamHandler } from 'express';
import { z } from 'zod';
import { NotFoundError } from '../http/errors.js';
import type { OnATavola, TavolaRepository } from '../repositories/tavola-repository.js';
import type { Gate } from './gate.js';

/**
 * **An Unchecked Tavola is not there for anybody but an Editor** (ADR 0016) — not its address,
 * not its scan, not any number on it.
 *
 * Asked of the address rather than inside each handler, because it is a property of the address:
 * everything that carries a Tavola, a Position or a Scan id names something on exactly one
 * Tavola, and a handler that forgot to ask would be the one way a Member reached a sheet nobody
 * has checked. The answer is "no such Tavola", the same words a made-up id gets, so asking does
 * not tell a Member that there is something there to wait for.
 *
 * An id that is not an id at all is left for the handler to refuse in its own words.
 */
export interface UncheckedTavolaGuard {
  tavolaId: RequestParamHandler;
  positionId: RequestParamHandler;
  scanId: RequestParamHandler;
}

const anId = z.uuid();

export function createUncheckedTavolaGuard(dependencies: {
  gate: Gate;
  tavolaRepository: TavolaRepository;
}): UncheckedTavolaGuard {
  const { gate, tavolaRepository } = dependencies;

  function guarding(on: (id: string) => OnATavola): RequestParamHandler {
    return (_request, response, next, value: unknown) => {
      void (async () => {
        try {
          const id = anId.safeParse(value);
          if (
            id.success &&
            !gate.seesUnchecked(response) &&
            (await tavolaRepository.isUnchecked(on(id.data)))
          ) {
            next(new NotFoundError('No such Tavola.'));
            return;
          }
          next();
        } catch (error) {
          next(error);
        }
      })();
    };
  }

  return {
    tavolaId: guarding((tavolaId) => ({ tavolaId })),
    positionId: guarding((positionId) => ({ positionId })),
    scanId: guarding((scanId) => ({ scanId })),
  };
}
