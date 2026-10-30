import type { Currency, PartInFull, SourceCondition } from '@ricambi/contracts';
import { violates } from '../db/constraints.js';
import type { EquivalentKind } from '@ricambi/contracts';
import { ConflictError, NotFoundError, ValidationError } from '../http/errors.js';
import type { Clock } from '../platform/clock.js';
import type { ModelRepository } from '../repositories/model-repository.js';
import type {
  EquivalentFields,
  FitmentFields,
  PartRecordRepository,
  PartRecordRows,
  SourceFields,
  SpecificationValue,
} from '../repositories/part-record-repository.js';
import type { PartRepository } from '../repositories/part-repository.js';
import type { PhotographRepository } from '../repositories/photograph-repository.js';
import type { SpecificationListRepository } from '../repositories/specification-list-repository.js';
import { toPartInFull } from './catalog-view.js';
import { ISO_DATE } from './days.js';
import { readAmount } from './money.js';

/**
 * What fits a Part, what can be bought instead of it, and where it has been available.
 *
 * **This is the content that turns a catalog into something a restorer can use.** Everything
 * before it says what the factory called a component; this says whether it fits their car, what
 * to order now the original has not been made for fifty years, and who had one when anybody last
 * looked. The cross-reference from an unobtainable original to a purchasable modern equivalent is
 * the single most valuable thing the archive will hold.
 *
 * Two rules run through the whole file. A Fitment's qualifier is **free text and is never
 * parsed** — structured chassis and date ranges were rejected deliberately, because they demand a
 * precision nobody has and would drop every half-known break on the way in. And a price is
 * **inseparable from the date it was seen**: refused here, refused by a check constraint, and
 * unrepresentable in the shape that leaves — three times over, because a stale figure printed as
 * though it were today's is the one way this archive could mislead somebody who trusted it.
 */

/** A Fitment as an Editor typed it, narrowed: a blank qualifier has become an absent one. */
export interface NewFitment {
  modelId: string;
  qualifier: string | null;
}

export interface NewEquivalent {
  kind: EquivalentKind;
  maker: string;
  reference: string | null;
  note: string | null;
}

/**
 * A Source as an Editor typed it.
 *
 * `price` is still the string that was typed, because turning `250,50` into 25050 is this
 * layer's job and doing it in a browser would mean a decimal rounded before it ever arrived.
 */
export interface NewSource {
  name: string;
  url: string;
  condition: SourceCondition | null;
  price: string | null;
  currency: Currency;
  observedOn: string | null;
  note: string | null;
}

/** A Specification as an Editor typed it: the name chosen from the list, and the value. */
export interface NewSpecification {
  nameId: string;
  value: string;
}

/**
 * **A number and nothing else**: digits, a sign, and one point or comma as the decimal
 * separator. Not "about 40", not "412 g" with the Unit typed again, and not a thousands
 * separator, which a point and a comma both being decimal would make ambiguous.
 */
const SPECIFICATION_NUMBER = /^-?\d+(?:[.,]\d+)?$/;

/** As many suggestions as fit under a field without the list becoming a page of its own. */
const SUGGESTIONS = 10;

export interface PartRecordService {
  /**
   * Every collection a Part carries, read once for a whole Position rather than once a Part.
   * Five Parts at a number would otherwise be twenty queries to answer one click.
   */
  recordsFor(partIds: string[]): Promise<Map<string, PartRecordRows>>;

  /**
   * **The whole Part, re-read** — what every write against a Part's own record answers with,
   * including the ones in `photograph-service` that are not in this file.
   *
   * It is on the interface rather than private because there is exactly one right answer to
   * "what does a write to a Part hand back", and a second implementation of it somewhere else
   * would be a second chance to hand back a list in an order this one does not agree with.
   */
  readWhole(partId: string): Promise<PartInFull>;

  addSpecification(partId: string, specification: NewSpecification): Promise<PartInFull>;
  correctSpecification(specificationId: string, value: string): Promise<PartInFull>;
  removeSpecification(specificationId: string): Promise<PartInFull>;
  /** The words already recorded under a name, for an Editor typing a new one. */
  suggestSpecificationValues(nameId: string, typed: string): Promise<string[]>;

  addFitment(partId: string, fitment: NewFitment): Promise<PartInFull>;
  correctFitment(fitmentId: string, fitment: NewFitment): Promise<PartInFull>;
  removeFitment(fitmentId: string): Promise<PartInFull>;

  addEquivalent(partId: string, equivalent: NewEquivalent): Promise<PartInFull>;
  correctEquivalent(equivalentId: string, equivalent: NewEquivalent): Promise<PartInFull>;
  removeEquivalent(equivalentId: string): Promise<PartInFull>;

  addSource(partId: string, source: NewSource): Promise<PartInFull>;
  correctSource(sourceId: string, source: NewSource): Promise<PartInFull>;
  removeSource(sourceId: string): Promise<PartInFull>;
}

export function createPartRecordService(dependencies: {
  clock: Clock;
  modelRepository: ModelRepository;
  partRepository: PartRepository;
  partRecordRepository: PartRecordRepository;
  photographRepository: PhotographRepository;
  specificationListRepository: SpecificationListRepository;
}): PartRecordService {
  const {
    clock,
    modelRepository,
    partRepository,
    partRecordRepository,
    photographRepository,
    specificationListRepository,
  } = dependencies;

  /** The Part, or the plain refusal — nothing here is recordable against something that is gone. */
  async function partThatExists(partId: string) {
    const part = await partRepository.findPart(partId);
    if (!part) {
      throw new NotFoundError('No such Part.');
    }
    return part;
  }

  /**
   * **The whole Part, re-read**, which is what every write below answers with.
   *
   * Not the row that changed. Each of the three is an ordered list and the order is the archive's
   * rule — the cars in the catalog's order, the equivalents from the original supplier outwards,
   * the sources with the most recently seen price first. A browser handed one row would have to
   * work out where it belongs in three different orders, in a second place free to disagree.
   */
  async function readWhole(partId: string): Promise<PartInFull> {
    const part = await partThatExists(partId);
    const records = await recordsFor([partId]);
    return toPartInFull(part, records.get(partId) ?? emptyRecord());
  }

  function emptyRecord(): PartRecordRows {
    return { specifications: [], fitments: [], equivalents: [], sources: [], photographs: [] };
  }

  async function recordsFor(partIds: string[]): Promise<Map<string, PartRecordRows>> {
    const [specifications, fitments, equivalents, sources, photographs] = await Promise.all([
      partRecordRepository.listSpecifications(partIds),
      partRecordRepository.listFitments(partIds),
      partRecordRepository.listEquivalents(partIds),
      partRecordRepository.listSources(partIds),
      photographRepository.listForParts(partIds),
    ]);

    const byPart = new Map<string, PartRecordRows>();
    const of = (partId: string) => {
      const found = byPart.get(partId) ?? emptyRecord();
      byPart.set(partId, found);
      return found;
    };

    // The order each query came back in is the order the screen reads, so each list is only ever
    // appended to — nothing here re-sorts what the database has already decided.
    for (const row of specifications) {
      of(row.partId).specifications.push(row);
    }
    for (const row of fitments) {
      of(row.partId).fitments.push(row);
    }
    for (const row of equivalents) {
      of(row.partId).equivalents.push(row);
    }
    for (const row of sources) {
      of(row.partId).sources.push(row);
    }
    for (const row of photographs) {
      of(row.partId).photographs.push(row);
    }
    return byPart;
  }

  /** The name, with the Unit that decides what a value under it may be. */
  async function nameThatExists(nameId: string) {
    const name = await specificationListRepository.findName(nameId);
    if (!name) {
      throw new NotFoundError('No such Specification name.');
    }
    return name;
  }

  /**
   * **What the name makes of what was typed.** Under a name with a Unit, a number, with the
   * comma read as a point; the Unit is the name's and never typed. Under one without, words,
   * trimmed and otherwise kept exactly as the Editor wrote them.
   */
  function specificationValue(
    name: { name: string; unit: { symbol: string } | null },
    typed: string,
  ): SpecificationValue {
    const value = typed.trim();
    if (value === '') {
      throw new ValidationError(
        `Write what the ${name.name.toLowerCase()} is, or remove the Specification instead.`,
      );
    }
    if (name.unit === null) {
      return { valueNumber: null, valueText: value };
    }
    if (!SPECIFICATION_NUMBER.test(value)) {
      throw new ValidationError(
        `${name.name} is a number in ${name.unit.symbol} — 412, 412.5 or 412,5. The Unit is not typed.`,
      );
    }
    return { valueNumber: value.replace(',', '.'), valueText: null };
  }

  /** A name whose Unit was changed, or which was removed, between reading it and writing to it. */
  function nameChanged(): never {
    throw new ConflictError(
      'That Specification name was changed while this was being recorded. Read it again and record the value afresh.',
    );
  }

  /** A car the archive actually has. A Fitment naming one it does not is a statement about nothing. */
  async function modelThatExists(modelId: string) {
    if (!(await modelRepository.findById(modelId))) {
      throw new NotFoundError('No such Model.');
    }
  }

  function fitmentFields(fitment: NewFitment): FitmentFields {
    return { modelId: fitment.modelId, qualifier: fitment.qualifier };
  }

  function equivalentFields(equivalent: NewEquivalent): EquivalentFields {
    return {
      kind: equivalent.kind,
      maker: equivalent.maker,
      reference: equivalent.reference,
      note: equivalent.note,
    };
  }

  /**
   * **Where the price rule is enforced at the point of entry** (story 76).
   *
   * A price with no date is refused rather than stored and hidden, because an archive that held
   * one would eventually print it — and a figure from 2011 shown without its date reads as this
   * morning's. A date the archive has not reached yet is refused for the same reason from the
   * other end: nobody saw a price tomorrow, so it is a typed year that would otherwise sit at the
   * top of the list as the freshest thing on it.
   */
  function sourceFields(source: NewSource): SourceFields {
    const common = {
      name: source.name,
      url: source.url,
      condition: source.condition,
      note: source.note,
    };

    if (source.price === null) {
      // The date goes with it. An observed date on its own says a shop was looked at, which is
      // not something anybody reads — and keeping it would let a correction that clears a price
      // leave the date behind as the newest thing in a list ordered by it.
      return { ...common, priceAmount: null, priceCurrency: null, observedOn: null };
    }

    const amount = readAmount(source.price);
    if (amount === null) {
      throw new ValidationError(
        'A price is an amount — 250, 250.00 or 250,50. Leave it blank if none was seen.',
      );
    }
    if (amount <= 0) {
      throw new ValidationError('A price of nothing is not a price. Leave it blank instead.');
    }

    if (source.observedOn === null) {
      throw new ValidationError(
        'A price needs the date it was seen. Without one, nobody can tell this year’s figure from a decade-old one.',
      );
    }
    if (!ISO_DATE.test(source.observedOn)) {
      throw new ValidationError('That is not a date the archive can read.');
    }
    if (source.observedOn > today()) {
      throw new ValidationError('A price cannot have been seen on a date that has not happened.');
    }

    return {
      ...common,
      priceAmount: amount,
      priceCurrency: source.currency,
      observedOn: source.observedOn,
    };
  }

  /** Today, from the injected clock and never the machine's idea of now, as `YYYY-MM-DD`. */
  function today(): string {
    return clock.now().toISOString().slice(0, 10);
  }

  /**
   * What the database refused, said in words an Editor can act on. Read after the fact rather
   * than checked before it, because the database is what decides — two Editors recording the same
   * cross-reference at the same moment cannot both pass a check and both write.
   */
  function refusalFor(error: unknown): never {
    if (violates(error, 'specifications_one_per_part_and_name')) {
      throw new ConflictError(
        'This Part already has a value under that name. Correct it rather than adding a second one.',
      );
    }
    if (violates(error, 'fitments_part_id_model_id_unique')) {
      throw new ConflictError(
        'This Part is already recorded as fitting that car. Correct the qualification rather than adding a second one.',
      );
    }
    if (
      violates(error, 'equivalents_reference_unique') ||
      violates(error, 'equivalents_unreferenced_unique')
    ) {
      throw new ConflictError('That equivalent is already recorded for this Part.');
    }
    throw error;
  }

  /** A row that has been removed or corrected out from under whoever is asking. */
  function gone(what: string): never {
    throw new NotFoundError(`No such ${what}.`);
  }

  return {
    recordsFor,
    readWhole,

    async addSpecification(partId, specification) {
      await partThatExists(partId);
      const name = await nameThatExists(specification.nameId);

      const added = await partRecordRepository
        .addSpecification(
          { partId, nameId: name.id, ...specificationValue(name, specification.value) },
          name.unit?.id ?? null,
        )
        .catch(refusalFor);
      return added === 'name-changed' ? nameChanged() : readWhole(partId);
    },

    async correctSpecification(specificationId, value) {
      const current = await partRecordRepository.findSpecification(specificationId);
      if (!current) {
        gone('Specification');
      }
      const name = await nameThatExists(current.nameId);

      const corrected = await partRecordRepository.updateSpecification(
        specificationId,
        specificationValue(name, value),
        name.unit?.id ?? null,
      );
      if (corrected === 'name-changed') {
        nameChanged();
      }
      return corrected ? readWhole(corrected.partId) : gone('Specification');
    },

    async removeSpecification(specificationId) {
      const removed = await partRecordRepository.removeSpecification(specificationId);
      return removed ? readWhole(removed.partId) : gone('Specification');
    },

    async suggestSpecificationValues(nameId, typed) {
      const name = await nameThatExists(nameId);
      // A number is not chosen from what others typed; there is nothing to suggest under a Unit.
      if (name.unit !== null) {
        return [];
      }
      return partRecordRepository.suggestValues(nameId, typed.trim(), SUGGESTIONS);
    },

    async addFitment(partId, fitment) {
      await partThatExists(partId);
      await modelThatExists(fitment.modelId);

      await partRecordRepository
        .addFitment({ partId, ...fitmentFields(fitment) })
        .catch(refusalFor);
      return readWhole(partId);
    },

    async correctFitment(fitmentId, fitment) {
      await modelThatExists(fitment.modelId);

      const corrected = await partRecordRepository
        .updateFitment(fitmentId, fitmentFields(fitment))
        .catch(refusalFor);
      return corrected ? readWhole(corrected.partId) : gone('Fitment');
    },

    async removeFitment(fitmentId) {
      const removed = await partRecordRepository.removeFitment(fitmentId);
      return removed ? readWhole(removed.partId) : gone('Fitment');
    },

    async addEquivalent(partId, equivalent) {
      await partThatExists(partId);

      await partRecordRepository
        .addEquivalent({ partId, ...equivalentFields(equivalent) })
        .catch(refusalFor);
      return readWhole(partId);
    },

    async correctEquivalent(equivalentId, equivalent) {
      const corrected = await partRecordRepository
        .updateEquivalent(equivalentId, equivalentFields(equivalent))
        .catch(refusalFor);
      return corrected ? readWhole(corrected.partId) : gone('Equivalent');
    },

    async removeEquivalent(equivalentId) {
      const removed = await partRecordRepository.removeEquivalent(equivalentId);
      return removed ? readWhole(removed.partId) : gone('Equivalent');
    },

    async addSource(partId, source) {
      await partThatExists(partId);

      // The price rule is applied before the write and not after it, because it is the Editor's
      // mistake to correct rather than a collision between two of them.
      await partRecordRepository.addSource({ partId, ...sourceFields(source) });
      return readWhole(partId);
    },

    async correctSource(sourceId, source) {
      const corrected = await partRecordRepository.updateSource(sourceId, sourceFields(source));
      return corrected ? readWhole(corrected.partId) : gone('Source');
    },

    async removeSource(sourceId) {
      const removed = await partRecordRepository.removeSource(sourceId);
      return removed ? readWhole(removed.partId) : gone('Source');
    },
  };
}
