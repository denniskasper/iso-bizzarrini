import { defineConfig } from 'drizzle-kit';

/**
 * Generating a migration is `pnpm db:generate`. Two things are done to the output by hand
 * afterwards, every time:
 *
 * 1. **Rename the file and its `meta/_journal.json` tag** to say what it does. Drizzle names
 *    them after a random Marvel character.
 * 2. **Strip the `"public".` qualifier** drizzle-kit writes into foreign keys. The API test
 *    seam gives every worker its own Postgres schema and reaches it through `search_path`, so
 *    a migration that names `public` explicitly creates a table in the worker's schema whose
 *    foreign key points at a table in someone else's.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://ricambi:ricambi@localhost:5433/ricambi',
  },
  strict: true,
  verbose: true,
});
