import type { SearchResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import type { Gate } from '../access/gate.js';
import { z } from 'zod';
import type { SearchService } from '../services/search-service.js';
import { required } from './fields.js';

/**
 * What a member typed into the search field.
 *
 * **Something**, because a blank query is not a request for every Part in the archive — it is a
 * field nobody has finished typing into, and answering it with the catalog would be the one
 * address that hands over the whole thing a page at a time. The trim is the same one every text
 * field in this API gets: whitespace a form added around a value is not part of the value.
 */
const searchQuery = z.object({
  q: required('Type a number, or the beginning of a name.'),
});

export interface SearchController {
  find: RequestHandler;
}

export function createSearchController(dependencies: {
  gate: Gate;
  searchService: SearchService;
}): SearchController {
  const { gate, searchService } = dependencies;

  return {
    find: async (request, response) => {
      const { q } = searchQuery.parse(request.query);

      const body: SearchResponse = await searchService.find(q, gate.seesUnchecked(response));
      response.json(body);
    },
  };
}
