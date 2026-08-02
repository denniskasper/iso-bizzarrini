# 03 — Model, Tavola, scan ingest and private tiles

**What to build:** An Editor creates a Model, uploads a scanned factory drawing, and it becomes a
Tavola with its number, both names, its Category and the factory's own header. The scan is
prepared for deep zoom automatically, and none of it is reachable by anyone not signed in.

**Blocked by:** 01 — App skeleton with both test seams.

**Status:** ready-for-agent

- [ ] A Model is created with brand, model, series and model years
- [ ] Models are listed grouped by brand
- [ ] A Tavola belongs to exactly one Model; its number is unique within that Model
- [ ] A Tavola carries its Italian name, English name and one Category
- [ ] The factory's Sezione, Gruppo and Sottogruppo are recorded **verbatim** as provenance, and are not used for navigation
- [ ] A scan is uploaded and an image pyramid generated at ingest; the Editor never thinks about image formats
- [ ] Original scans and generated tiles are stored **privately** — no public path, no guessable URL
- [ ] Tiles are served only through an authenticated route; a signed-out request is refused
- [ ] Tiles carry long, immutable cache headers
- [ ] Re-uploading a scan regenerates the tiles without orphaning the Tavola
- [ ] A Tavola with no scan yet is a legitimate state
- [ ] UI and design work uses the `/frontend-design` skill
