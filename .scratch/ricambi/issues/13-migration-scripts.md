# 13 — Migration scripts for the existing archive

**What to build:** The Club's existing spreadsheets and scans become real Models, Tavole, Parts,
Listings, Fitments, Equivalents and Sources in the system.

**This is the ticket that unblocks the volunteers.** Until it lands, marking Tavole has nothing to
attach to; after it lands, the long pole of the project can run in parallel with everything else.

**Blocked by:** 03 — Model, Tavola, scan ingest and private tiles; 08 — Fitments, Equivalents and
Sources.

**Status:** ready-for-agent

- [ ] Migration scripts live in version control and are **re-runnable** — running twice does not duplicate
- [ ] The existing spreadsheets are transformed into Models, Tavole, Parts and Listings
- [ ] The repeating vehicle block in the source sheets becomes Fitments with their qualifiers
- [ ] Fixed supplier and OEM columns are mapped to typed Equivalents; the kind assigned for each is recorded
- [ ] Source columns become Sources; any price without a date is loaded without the price, not with an undated one
- [ ] The `Related Parts` column becomes symmetric Related Position links
- [ ] The `Sub-Assembly` and its position ranges become Sub-assemblies
- [ ] Scans are ingested and tiled in bulk
- [ ] A dry-run mode reports what would be created, matched and skipped, without writing
- [ ] A report lists every row that could not be loaded and why — nothing is dropped silently
- [ ] Which catalog column is the Catalog Number and which the Disegno Origine is **confirmed against an uncropped catalog page before loading begins** (see the spec's Further Notes)
- [ ] Marks are **not** loaded — no existing data records where a Position sits on a scan; that work is human
