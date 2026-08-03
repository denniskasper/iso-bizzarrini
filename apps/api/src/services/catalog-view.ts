import type {
  CatalogModel,
  Category,
  Part,
  ListedElsewhere,
  PartListing,
  Position,
  TavolaListing,
  TavolaScan,
  TavolaSummary,
} from '@ricambi/contracts';
import type { CategoryRow, ModelRow, PartRow, ScanRow } from '../db/schema.js';
import { scanImageUrl } from '../images/scan-addresses.js';
import type {
  ElsewhereRow,
  ListingOnTavola,
  ListingWithPart,
} from '../repositories/part-repository.js';
import type { PositionWithMarks } from '../repositories/position-repository.js';
import type { TavolaWithCategoryAndScan } from '../repositories/tavola-repository.js';

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
 * `numberSort` is deliberately not reported. It is a sort key the archive derives so a list
 * reads 1, 2, 10 — never something to show, and never how two Positions are told apart. What a
 * member reads is the number as the factory printed it.
 */
export function toPosition(row: PositionWithMarks): Position {
  return {
    id: row.id,
    number: row.number,
    marks: row.marks.map((mark) => ({ id: mark.id, x: mark.x, y: mark.y })),
  };
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

/** One Part's appearance on one Tavola, with wherever else that Part is listed. */
export function toPartListing(row: ListingWithPart, elsewhere: ElsewhereRow[]): PartListing {
  return {
    id: row.id,
    quantityPerCar: row.quantityPerCar,
    drawn: row.drawn,
    part: toPart(row.part),
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
