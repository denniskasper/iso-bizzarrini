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
- [ ] A scan is uploaded and prepared for viewing at ingest; the Editor never thinks about image formats
- [ ] Original scans and any derived images are stored **privately** — no public path, no guessable URL
- [ ] Images are served only through an authenticated route; a signed-out request is refused
- [ ] Images carry long, immutable cache headers
- [ ] Re-uploading a scan regenerates derived images without orphaning the Tavola

## Decide here: tiled or not

**Measure the real archive before building the ingest pipeline.** Tiling was chosen on an
assumption — A3 at 300 dpi — that nothing has verified. **No real scan has been measured yet.**
The sample tavole in the prior implementation are artificial images, and the only genuine
drawing seen so far was supplied downsized, so neither tells us anything. ADR 0006 defers the
choice to this ticket.

- [ ] Obtain at least a dozen **real** scans from the club archive and record their pixel dimensions and file sizes
- [ ] Tile only if the scans are large enough that sending a whole one to a phone on poor reception actually hurts
- [ ] Otherwise serve one private image and pan/zoom client-side — no pyramid, no tile storage
- [ ] Check the decisive question directly: at the archive's real resolution, **can a position number be read on a phone?** If not, no delivery format saves it and the scanning itself needs revisiting
- [ ] Either way, Marks are stored in **fractional image coordinates**, so this decision can be reversed later without re-marking a single Tavola
- [ ] Record the measurement and the choice, so nobody re-litigates it from the same assumption
- [ ] A Tavola with no scan yet is a legitimate state
- [ ] UI and design work uses the `/frontend-design` skill
