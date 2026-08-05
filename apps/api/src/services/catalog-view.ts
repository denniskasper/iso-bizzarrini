import type {
  CatalogModel,
  Category,
  Equivalent,
  Fitment,
  Part,
  PartInFull,
  Photograph,
  ListedElsewhere,
  ListedOn,
  PartListing,
  Position,
  RelatedPosition,
  SearchListing,
  Source,
  SubAssembly,
  TavolaListing,
  TavolaProgress,
  TavolaScan,
  TavolaSummary,
} from '@ricambi/contracts';
import type {
  CategoryRow,
  EquivalentRow,
  ModelRow,
  PartRow,
  PhotographRow,
  ScanRow,
  SourceRow,
  SubAssemblyRow,
} from '../db/schema.js';
import { photographImageUrl, scanImageUrl } from '../images/image-addresses.js';
import type { FitmentWithModel, PartRecordRows } from '../repositories/part-record-repository.js';
import type {
  ElsewhereRow,
  ListedOnRow,
  ListingOnTavola,
  ListingWithPart,
} from '../repositories/part-repository.js';
import type { PositionWithMarks } from '../repositories/position-repository.js';
import type {
  TavolaProgressRow,
  TavolaWithCategoryAndScan,
} from '../repositories/tavola-repository.js';

/**
 * Rows in, contracts out. Every service that reports part of the catalog comes through here,
 * so a Tavola looks the same whether it was read on its own or as one line of a Model's list.
 */

export function toCatalogModel(row: ModelRow): CatalogModel {
  return {
    id: row.id,
    brand: row.brand,
    name: row.name,
    series: row.series,
    modelYears: row.modelYears,
  };
}

export function toCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, slug: row.slug };
}

export function toTavolaSummary(row: TavolaWithCategoryAndScan): TavolaSummary {
  return {
    id: row.id,
    number: row.number,
    nameIt: row.nameIt,
    nameEn: row.nameEn,
    category: toCategory(row.category),
    scan: row.scan ? toTavolaScan(row.scan) : null,
  };
}

/**
 * How much of one sheet has been done.
 *
 * The Tavola is named by id alone: whatever prints this is printing it against the Model's own
 * list of sheets and already holds their numbers and names. Carrying them here as well would be
 * the same fact in two places.
 */
export function toTavolaProgress(row: TavolaProgressRow): TavolaProgress {
  return {
    tavolaId: row.tavolaId,
    positions: row.positions,
    marked: row.marked,
    listed: row.listed,
  };
}

/**
 * `numberSort` is deliberately not reported. It is a sort key the archive derives so a list
 * reads 1, 2, 10 — never something to show, and never how two Positions are told apart. What a
 * member reads is the number as the factory printed it.
 *
 * `related` is handed in rather than read off the row, because a link is one row shared by two
 * Positions: what belongs on *this* Position is the other end of each of them, and only something
 * holding the whole sheet can say which end that is.
 */
export function toPosition(row: PositionWithMarks, related: RelatedPosition[]): Position {
  return {
    id: row.id,
    number: row.number,
    marks: row.marks.map((mark) => ({ id: mark.id, x: mark.x, y: mark.y })),
    // Null is the ordinary case, and says what it looks like: this number is in no Sub-assembly.
    subAssemblyId: row.subAssemblyId,
    related,
  };
}

/** A name and nothing else — no number, and nothing to order it by (spec, Out of Scope). */
export function toSubAssembly(row: SubAssemblyRow): SubAssembly {
  return { id: row.id, name: row.name };
}

/**
 * A Part, reported field for field. Nothing is defaulted and nothing is filled in: a Part with
 * no Catalog Number reports `null` and the screen says so plainly, because a placeholder is how
 * a member ends up hunting for a number that does not exist (ADR 0001).
 *
 * `catalogNote` and `note` come through as the two fields they are. Merging them here would be
 * the one place in this application where evidence and interpretation could be lost, since
 * everything downstream reads this shape.
 */
export function toPart(row: PartRow): Part {
  return {
    id: row.id,
    nameEn: row.nameEn,
    nameIt: row.nameIt,
    catalogNumber: row.catalogNumber,
    disegnoOrigine: row.disegnoOrigine,
    description: row.description,
    dimensions: row.dimensions,
    materialFinish: row.materialFinish,
    catalogNote: row.catalogNote,
    note: row.note,
  };
}

export function toFitment(row: FitmentWithModel): Fitment {
  return { id: row.id, model: toCatalogModel(row.model), qualifier: row.qualifier };
}

export function toEquivalent(row: EquivalentRow): Equivalent {
  return {
    id: row.id,
    kind: row.kind,
    maker: row.maker,
    reference: row.reference,
    note: row.note,
  };
}

/**
 * A Source, with **the price and its date assembled into the one thing they are.**
 *
 * The three columns become one nullable object here and nowhere else, which is what makes it
 * impossible for anything downstream to print an amount without the date it was seen. The
 * database has already refused any row where they disagree; this is the same rule said in a
 * shape, so no screen has to remember it (stories 75, 76).
 */
export function toSource(row: SourceRow): Source {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    condition: row.condition,
    price:
      row.priceAmount !== null && row.priceCurrency !== null && row.observedOn !== null
        ? { amount: row.priceAmount, currency: row.priceCurrency, observedOn: row.observedOn }
        : null,
    note: row.note,
  };
}

/**
 * A Photograph, addressed the way a scan is: **the display image's dimensions**, because that is
 * the picture "view it larger" opens, and knowing its shape before it arrives is what stops a
 * grid reflowing under a member's thumb. What was uploaded may be much larger; that is recorded
 * on the row and is nothing a browser needs to know.
 */
export function toPhotograph(row: PhotographRow): Photograph {
  return {
    id: row.id,
    width: row.displayWidth,
    height: row.displayHeight,
    displayUrl: photographImageUrl(row.id, 'display'),
    previewUrl: photographImageUrl(row.id, 'preview'),
  };
}

/** The Part with everything the archive holds about the component itself. */
export function toPartInFull(row: PartRow, record: PartRecordRows): PartInFull {
  return {
    ...toPart(row),
    fitments: record.fitments.map(toFitment),
    equivalents: record.equivalents.map(toEquivalent),
    sources: record.sources.map(toSource),
    photographs: record.photographs.map(toPhotograph),
  };
}

/** One Part's appearance on one Tavola, with wherever else that Part is listed. */
export function toPartListing(
  row: ListingWithPart,
  record: PartRecordRows,
  elsewhere: ElsewhereRow[],
): PartListing {
  return {
    id: row.id,
    quantityPerCar: row.quantityPerCar,
    drawn: row.drawn,
    part: toPartInFull(row.part, record),
    elsewhere: elsewhere.map(toListedElsewhere),
  };
}

/**
 * One line of a Tavola's index. **Four fields of the Part and no more** — the columns a printed
 * catalog page prints — because this is a list of two hundred things a member skims, and the
 * whole Part arrives when they pick one, from the Position they picked it at.
 */
export function toTavolaListing(row: ListingOnTavola): TavolaListing {
  return {
    id: row.id,
    positionId: row.position?.id ?? null,
    quantityPerCar: row.quantityPerCar,
    drawn: row.drawn,
    part: {
      id: row.part.id,
      nameEn: row.part.nameEn,
      nameIt: row.part.nameIt,
      catalogNumber: row.part.catalogNumber,
    },
  };
}

/**
 * A sheet a Part is listed on — the sheet and the car, and nothing about the appearance itself.
 *
 * The neighbour of `toListedElsewhere` below, and deliberately narrower: that one answers *where
 * else is this used, and how many are fitted there*, which a member reads; this one answers *how
 * far does correcting this reach*, which is a count of drawings and has no quantity in it.
 */
export function toListedOn(row: ListedOnRow): ListedOn {
  return {
    tavolaId: row.tavola.id,
    tavolaNumber: row.tavola.number,
    nameEn: row.tavola.nameEn,
    model: toCatalogModel(row.model),
  };
}

/**
 * Somewhere a Part a search found is listed — **the car, the sheet and the number**, and nothing
 * about the appearance itself.
 *
 * The third neighbour of the two above, and narrower than either. `toListedElsewhere` answers
 * *where else is this used and how many are fitted there*, which a member reads with a drawing
 * already in front of them; this answers *which of these is mine, and where do I go to see it*,
 * asked by somebody who arrived holding a bracket and no drawing at all. A quantity means nothing
 * until they have picked one, so none is reported.
 */
export function toSearchListing(row: ElsewhereRow): SearchListing {
  return {
    id: row.listing.id,
    tavolaId: row.tavola.id,
    tavolaNumber: row.tavola.number,
    nameEn: row.tavola.nameEn,
    model: toCatalogModel(row.model),
    positionNumber: row.position?.number ?? null,
  };
}

export function toListedElsewhere(row: ElsewhereRow): ListedElsewhere {
  return {
    tavolaId: row.tavola.id,
    tavolaNumber: row.tavola.number,
    nameEn: row.tavola.nameEn,
    model: toCatalogModel(row.model),
    positionNumber: row.position?.number ?? null,
    quantityPerCar: row.listing.quantityPerCar,
  };
}

/**
 * The dimensions reported are the **display** image's, because that is the picture a viewer
 * lays Marks over. What was uploaded may be larger; that is recorded on the row, for the
 * measurement ADR 0013 waits on, and is nothing a browser needs to know.
 */
export function toTavolaScan(row: ScanRow): TavolaScan {
  return {
    id: row.id,
    width: row.displayWidth,
    height: row.displayHeight,
    displayUrl: scanImageUrl(row.id, 'display'),
    previewUrl: scanImageUrl(row.id, 'preview'),
  };
}
