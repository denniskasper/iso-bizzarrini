import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { categorySlug, numericPrefixOf } from '../../src/catalog/naming.js';
import type { Db } from '../../src/db/client.js';
import {
  categories,
  models,
  tavole,
  type CategoryRow,
  type ModelRow,
  type NewModelRow,
  type TavolaRow,
} from '../../src/db/schema.js';

/**
 * Catalog fixtures — for arranging the state a test needs to *start* from. What a test is
 * actually about always goes through HTTP: a Tavola created by this function proves nothing
 * about creating a Tavola.
 */
export async function givenModels(db: Db, ...rows: NewModelRow[]): Promise<ModelRow[]> {
  return db.insert(models).values(rows).returning();
}

export async function givenModel(db: Db, row: NewModelRow): Promise<ModelRow> {
  const [model] = await givenModels(db, row);
  if (!model) {
    throw new Error('The Model fixture inserted nothing.');
  }
  return model;
}

/**
 * A Category on the list, as an Administrator would have put it there. Asking for one that is
 * already listed returns that one, so a test can name the same system twice without caring.
 */
export async function givenCategory(db: Db, name: string): Promise<CategoryRow> {
  const slug = categorySlug(name);

  await db
    .insert(categories)
    .values({ name, slug })
    .onConflictDoNothing({ target: categories.slug });

  const [category] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  if (!category) {
    throw new Error('The Category fixture inserted nothing.');
  }
  return category;
}

export async function givenCategories(db: Db, ...names: string[]): Promise<CategoryRow[]> {
  const listed: CategoryRow[] = [];
  for (const name of names) {
    listed.push(await givenCategory(db, name));
  }
  return listed;
}

export interface TavolaFixture {
  number?: string;
  nameIt?: string;
  nameEn?: string;
  /** `null` for a sheet filed under no Category. Left out, it is filed under Brakes. */
  category?: string | null;
  catalogSection?: string | null;
  catalogGroup?: string | null;
  catalogSubgroup?: string | null;
}

export async function givenTavola(
  db: Db,
  modelId: string,
  fixture: TavolaFixture = {},
): Promise<TavolaRow> {
  const category =
    fixture.category === null ? null : await givenCategory(db, fixture.category ?? 'Brakes');

  const number = fixture.number ?? '12';
  const [row] = await db
    .insert(tavole)
    .values({
      modelId,
      number,
      numberSort: numericPrefixOf(number),
      nameIt: fixture.nameIt ?? 'Impianto freni',
      nameEn: fixture.nameEn ?? 'Brake system',
      categoryId: category?.id ?? null,
      catalogSection: fixture.catalogSection ?? null,
      catalogGroup: fixture.catalogGroup ?? null,
      catalogSubgroup: fixture.catalogSubgroup ?? null,
    })
    .returning();

  if (!row) {
    throw new Error('The Tavola fixture inserted nothing.');
  }
  return row;
}

export interface ImageFixture {
  width?: number;
  height?: number;
  format?: 'png' | 'jpeg' | 'tiff';
}

/**
 * A drawing to upload, generated rather than committed.
 *
 * There is no real scan in this repository and there should not be: the archive is the Club's,
 * and `AGENTS.md` keeps its material out of here. What ingest needs from a fixture is an image
 * of a known size in a known format, which this is.
 */
export function givenScanImage(options: ImageFixture = {}): Promise<Buffer> {
  return givenImage({ width: 1200, height: 800, ...options }, { r: 255, g: 255, b: 255 });
}

/**
 * And a photograph of a part, on the same terms and for the same reason.
 *
 * Named apart from the drawing above rather than shared under one name, because ingest treats the
 * two differently on purpose — a scan is kept lossless and a photograph is not — and a test that
 * uploads "an image" reads as though it did not matter which.
 */
export function givenPhotographImage(options: ImageFixture = {}): Promise<Buffer> {
  // Mid-grey rather than white: a lossless encoder given a blank white rectangle produces a file
  // so small that a size assertion about it would be about the fixture rather than about ingest.
  return givenImage({ width: 1600, height: 1200, ...options }, { r: 120, g: 118, b: 112 });
}

async function givenImage(
  options: ImageFixture,
  background: { r: number; g: number; b: number },
): Promise<Buffer> {
  const { width = 1200, height = 800, format = 'png' } = options;

  const image = sharp({ create: { width, height, channels: 3, background } });

  if (format === 'jpeg') {
    return image.jpeg().toBuffer();
  }
  if (format === 'tiff') {
    return image.tiff().toBuffer();
  }
  return image.png().toBuffer();
}
