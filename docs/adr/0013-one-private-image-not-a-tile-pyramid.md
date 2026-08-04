# One private image per Tavola, not a tile pyramid — and the archive measures itself

Deep-zoom tiling was in the specification because an assumption was in the specification: A3
sheets scanned at 300 dpi, which would be around 15 megapixels each and worth cutting into an
image pyramid. ADR 0006 deferred the choice to this ticket, and this ticket was to settle it by
measuring at least a dozen real scans from the club archive.

**No representative scan has been measured, because none has been obtained.** The only genuine
drawing anyone has seen was supplied downsized to 1245 × 809, and the sample tavole in the
earlier implementation of this product are artificial. That is the same evidence the assumption
was made on, so re-deciding from it would be re-litigating rather than measuring. It needs a
person with access to the Club's material, and that is not a thing code can produce.

**That one drawing has now been measured properly, and it fails the legibility test.** It is
Tavola 84 of the Rivolta at 1245 × 809 and 105 KB, and its position numbers are **7–9 px tall** —
under 3 px at fit-to-screen on a phone, and 8 px even magnified to the scan's own resolution,
which is as far as the viewer goes. The leader line merges into the `1` of `150`, which reads as
`T50`. At 41% of the long edge the threshold below asks for, it is not a drawing a member could
work from.

That is a fact about **one supplied file**, not about the Club's archive: it was sent downsized,
and nobody has said what the originals are. It is recorded here so the next person to look does
not mistake it for the measurement, and so the number is on the table when the Club is asked what
resolution its scanner is set to.

## What was built instead of waiting

**One private image per Tavola.** At ingest the upload is kept byte for byte and two derived
images are written: the whole drawing as lossless WebP, and a 480px preview so that listing a
Model's Tavole never downloads a drawing. There is no pyramid and no tile storage. The viewer
(ticket 04) pans and zooms one image client-side.

Lossless, not lossy, and it is worth saying why: the archive's whole value is that a sixty-year
old position number is still readable, the numbers are the smallest and highest-contrast marks
on the sheet, and a quality slider eats those first. On the one genuine drawing available it was
also *smaller* — 18% under the source PNG, 17% under the same image at quality 82 — because line
art is what lossless compression is good at.

**Ingest records the measurement for every scan it accepts**: source format, pixel dimensions,
and the byte size of the upload and of both derivatives. `pnpm scans:measure` reads those back,
applies the threshold below, and says which way the evidence points. So the question is answered
by running one command against a system that has real drawings in it, rather than by somebody
remembering to measure a dozen files by hand.

## The threshold, written down so it is not re-argued from the same assumption

Tile when **more than half the archive's drawings are over 3 MB to open**. That is roughly where
a whole image on a phone over poor reception stops being tolerable and the pyramid starts paying
for its complexity. Under it, sending one image is simpler, cacheable in one request, and
faster.

There is a second question the measurement answers, and it is the more important one: **at the
resolution the archive was actually scanned, can a position number be read on a phone?** Below
about 3000px on the long edge it cannot, and no delivery format rescues that — it means the
scanning has to be redone, which is a conversation with the Club and not a change to this
repository. `scans:measure` says so when it sees it.

## Why this is safe to reverse

**Marks are stored in fractional image coordinates** — as of ticket 05, actually and not only in
principle: `marks.x` and `marks.y` are doubles between 0 and 1, the API refuses anything outside
that range, and the viewer converts a pointer into a fraction of the sheet before anything leaves
it. A Tavola marked up today against one image is marked up against a tile pyramid tomorrow, at
any resolution, without re-marking a single sheet. That is what makes deferring this cheap, and it
is the constraint that must survive: a Mark stored in pixels would make this decision permanent by
accident.

The image route is already the shape a tiled archive needs — authenticated, immutable, addressed
by a scan id that changes when the scan does — so tiling would add derivatives and a route
parameter, not a redesign.

## What does not change either way

Privacy and access, which is what ADR 0006 actually fixed: the original and every derivative are
in a directory nothing serves, reachable only through an authenticated route, with `private,
max-age=31536000, immutable` and `Vary: Cookie`. No public bucket, no CDN, no guessable URL.
