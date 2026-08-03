import type {
  CatalogModel,
  Category,
  Position,
  TavolaScan,
  TavolaSummary,
} from '@ricambi/contracts';
import type { CategoryRow, ModelRow, ScanRow } from '../db/schema.js';
import { scanImageUrl } from '../images/scan-addresses.js';
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
