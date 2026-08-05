import type { SearchMatch, SearchResponse } from '@ricambi/contracts';
import { byPart } from '../repositories/by-part.js';
import type { PartRecordRepository } from '../repositories/part-record-repository.js';
import type { PartRepository } from '../repositories/part-repository.js';
import { toEquivalent, toPart, toSearchListing } from './catalog-view.js';

/**
 * **The route into the archive that does not start at the car.**
 *
 * Every other way in begins with a Model: choose your car, open the drawing, click the number.
 * Half the time a restorer begins at the other end — holding a bracket with something stamped on
 * it, and no idea which car it came off. This is that half.
 *
 * It is a file of its own rather than another method on `part-service` because it asks a
 * different question about the same rows. `part-service` answers *what sits at this number*, from
 * inside a drawing an Editor or a member already has open; this answers *what is this thing*,
 * from outside every drawing there is. What they share is the matching rule, and that lives in
 * `catalog/part-matching.ts` where both reach it.
 *
 * **Postgres and nothing else** (spec). No index to keep in step, no second store to fall behind
 * the archive, and no relevance score — the order is the archive's own, decided in the repository
 * and stated there.
 */

/**
 * **How many matches a search reports.** A prefix of a name is a broad thing to type and a list
 * of every washer in the archive is not an answer; what is held back is *said* rather than
 * silently dropped, because a capped list read as a complete one sends a member looking elsewhere
 * for something this archive has.
 *
 * More than an Editor's lookup reports, and for a different reason: the lookup is a list to pick
 * one row out of, and this is a list to recognise your own car in.
 */
const MOST_MATCHES_REPORTED = 50;

export interface SearchService {
  /**
   * What the archive has that this query names. The query is trimmed and non-blank — the
   * controller refuses one with nothing in it, because a blank search is not a request for the
   * whole archive but a field nobody has finished typing into.
   */
  find(query: string): Promise<SearchResponse>;
}

export function createSearchService(dependencies: {
  partRepository: PartRepository;
  partRecordRepository: PartRecordRepository;
}): SearchService {
  const { partRepository, partRecordRepository } = dependencies;

  return {
    async find(query) {
      // One more than will be reported is read, so that a capped answer can say it is one.
      const found = await partRepository.searchParts(query, MOST_MATCHES_REPORTED + 1);
      const reported = found.slice(0, MOST_MATCHES_REPORTED);
      const partIds = reported.map((part) => part.id);

      // Both for the whole answer at once rather than per match. Fifty results is fifty Parts,
      // and a query each for where they are listed is how a search becomes something a member
      // waits for — on a phone, in a garage, on whatever signal there is.
      const [places, equivalents] = await Promise.all([
        partRepository.listEverywhereListed(partIds),
        partRecordRepository.listMatchingEquivalents(partIds, query),
      ]);

      const placesByPart = byPart(places);
      const equivalentsByPart = byPart(equivalents);

      return {
        matches: reported.map((part): SearchMatch => ({
          part: toPart(part),
          // Empty for a Part the query found by its own number or name, where there is nothing
          // to explain. Present where it found it through something a supplier stamped on a
          // replacement, which is the answer the member has to be able to check.
          matchedEquivalents: (equivalentsByPart.get(part.id) ?? []).map(toEquivalent),
          // Empty for a Part listed on no drawing: findable, and nowhere to go.
          listings: (placesByPart.get(part.id) ?? []).map(toSearchListing),
        })),
        more: found.length > reported.length,
      };
    },
  };
}
