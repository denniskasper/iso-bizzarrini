import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { categorySlug, numericPrefixOf } from '../../src/catalog/naming.js';
import type { Db } from '../../src/db/client.js';
import {
  categories,
  models,
  tavole,
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

export interface TavolaFixture {
  number?: string;
  nameIt?: string;
  nameEn?: string;
  category?: string;
  catalogSection?: string | null;
  catalogGroup?: string | null;
  catalogSubgroup?: string | null;
}

export async function givenTavola(
  db: Db,
  modelId: string,
  fixture: TavolaFixture = {},
): Promise<TavolaRow> {
  const categoryName = fixture.category ?? 'Brakes';
  const slug = categorySlug(categoryName);

  await db
    .insert(categories)
    .values({ name: categoryName, slug })
    .onConflictDoNothing({ target: categories.slug });

  const [category] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  if (!category) {
    throw new Error('The Category fixture inserted nothing.');
  }

  const number = fixture.number ?? '12';
  const [row] = await db
    .insert(tavole)
    .values({
      modelId,
      number,
      numberSort: numericPrefixOf(number),
      nameIt: fixture.nameIt ?? 'Impianto freni',
      nameEn: fixture.nameEn ?? 'Brake system',
      categoryId: category.id,
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

/**
 * A drawing to upload, generated rather than committed.
 *
 * There is no real scan in this repository and there should not be: the archive is the Club's,
 * and `AGENTS.md` keeps its material out of here. What ingest needs from a fixture is an image
 * of a known size in a known format, which this is.
 */
export async function givenScanImage(
  options: { width?: number; height?: number; format?: 'png' | 'jpeg' | 'tiff' } = {},
): Promise<Buffer> {
  const { width = 1200, height = 800, format = 'png' } = options;

  const image = sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  });

  if (format === 'jpeg') {
    return image.jpeg().toBuffer();
  }
  if (format === 'tiff') {
    return image.tiff().toBuffer();
  }
  return image.png().toBuffer();
}
