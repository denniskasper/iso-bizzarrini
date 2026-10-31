import type { EnvironmentMode } from '@ricambi/contracts';
import type { RequestHandler, Response } from 'express';

/**
 * **Who may be found by a search engine** (ADR 0019): nobody, by default, and in every
 * environment. A response is let into the index only by the handler that knows it is one of the
 * Visitor pages — the landing, a Sample, the public copy of a Sample's drawing — and only in
 * production: a practice archive stays out of every index everywhere (ADR 0012).
 */
export interface Indexing {
  /** Marks every response `noindex`, before anything has answered it. */
  forbidByDefault: RequestHandler;
  /**
   * Lets this one response be indexed. Says whether it did: outside production it never does,
   * and the page keeps its own `noindex` too.
   */
  lift(response: Response): boolean;
}

const NOINDEX = 'noindex, nofollow';

export function createIndexing(environmentMode: EnvironmentMode): Indexing {
  return {
    forbidByDefault: (_request, response, next) => {
      response.setHeader('X-Robots-Tag', NOINDEX);
      next();
    },

    lift(response) {
      if (environmentMode !== 'production') {
        return false;
      }
      response.removeHeader('X-Robots-Tag');
      return true;
    },
  };
}
