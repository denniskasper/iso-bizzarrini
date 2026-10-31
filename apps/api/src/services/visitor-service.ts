import type { Landing } from '@ricambi/contracts';
import type { ModelRepository } from '../repositories/model-repository.js';
import type { ClubService } from './club-service.js';

/**
 * **What a Visitor is shown** (issue #128, ADR 0019): the one read of the archive outside the
 * members-only gate.
 *
 * **What this owns is which facts leave.** It builds its own shapes from the rows rather than
 * filtering what a member reads, so a field added to the member's Model, or to the Club's record,
 * never reaches a Visitor by default — the shape built here is the whole of what is sent.
 */
export interface VisitorService {
  /** Which Models the archive covers, how deep it goes for each, and what membership costs. */
  landing(): Promise<Landing>;
}

export function createVisitorService(dependencies: {
  modelRepository: ModelRepository;
  clubService: ClubService;
}): VisitorService {
  const { modelRepository, clubService } = dependencies;

  return {
    async landing() {
      const [covered, club] = await Promise.all([
        modelRepository.listCovered(),
        clubService.read(),
      ]);

      return {
        models: covered.map((model) => ({
          brand: model.brand,
          name: model.name,
          series: model.series,
          modelYears: model.modelYears,
          publishedTavole: model.publishedTavole,
        })),
        fee: club.fee,
        currency: club.currency,
      };
    },
  };
}
