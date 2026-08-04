# 03 — Model, Tavola, scan ingest and private tiles

**What to build:** An Editor creates a Model, uploads a scanned factory drawing, and it becomes a
Tavola with its number, both names, its Category and the factory's own header. The scan is
prepared for deep zoom automatically, and none of it is reachable by anyone not signed in.

**Blocked by:** 01 — App skeleton with both test seams.

**Status:** done

- [x] A Model is created with brand, model, series and model years
- [x] Models are listed grouped by brand
- [x] A Tavola belongs to exactly one Model; its number is unique within that Model
- [x] A Tavola carries its Italian name, English name and one Category
- [x] The factory's Sezione, Gruppo and Sottogruppo are recorded **verbatim** as provenance, and are not used for navigation
- [x] A scan is uploaded and prepared for viewing at ingest; the Editor never thinks about image formats
- [x] Original scans and any derived images are stored **privately** — no public path, no guessable URL
- [x] Images are served only through an authenticated route; a signed-out request is refused
- [x] Images carry long, immutable cache headers
- [x] Re-uploading a scan regenerates derived images without orphaning the Tavola

## Decide here: tiled or not

**Measure the real archive before building the ingest pipeline.** Tiling was chosen on an
assumption — A3 at 300 dpi — that nothing has verified. **No real scan has been measured yet.**
The sample tavole in the prior implementation are artificial images, and the only genuine
drawing seen so far was supplied downsized, so neither tells us anything. ADR 0006 defers the
choice to this ticket.

- [~] Obtain at least a dozen **real** scans from the club archive and record their pixel dimensions and file sizes — *deferred, not abandoned: the archive measures every scan it accepts and `pnpm scans:measure` reports it. See "Why the last three are deferred rather than open".*
- [~] Tile only if the scans are large enough that sending a whole one to a phone on poor reception actually hurts — *conditional on the measurement above; the threshold is set and applied automatically*
- [x] Otherwise serve one private image and pan/zoom client-side — no pyramid, no tile storage
- [~] Check the decisive question directly: at the archive's real resolution, **can a position number be read on a phone?** If not, no delivery format saves it and the scanning itself needs revisiting — *the check is built and runs automatically; the one drawing available fails it, and is not the archive*
- [x] Either way, Marks are stored in **fractional image coordinates**, so this decision can be reversed later without re-marking a single Tavola — *closed at ticket 05, which placed the first Mark; see Comments*
- [x] Record the measurement and the choice, so nobody re-litigates it from the same assumption
- [x] A Tavola with no scan yet is a legitimate state
- [x] UI and design work uses the `/frontend-design` skill

## Why the last three are deferred rather than open

**Closed with three boxes marked `~`, which means neither done nor waiting on anybody.** Every
line of code this ticket asks for is delivered and tested. What the three describe is a
*measurement of the Club's archive*, and there is no archive here to measure — so leaving the
ticket labelled `ready-for-human` was pointing at a person who has nothing they can do.

**The one drawing that has been supplied was measured, and it settles nothing.** Tavola 84 of the
Rivolta — the doors — arrived at **1245 × 809, 105 KB**, which is the same downsized asset ADR
0013 already discounted rather than a second data point. Measured properly this time:

- Its **position numbers are 7–9 px tall.** At fit-to-screen on a phone that is under 3 px, and
  even magnified to the scan's own resolution — as far as the viewer goes — it is 8 px. The
  leader line merges into the `1` of `150`, which reads as `T50`.
- Against the threshold in ADR 0013, the sheet is at **41% of the ~3000 px long edge** a legible
  position number needs. It is evidence that the scanning question is real, not evidence about
  the archive.

**Nothing is blocked by the deferral, and that is the point.** ADR 0013's answer — one private
image per Tavola, no pyramid — is in place, and reversing it costs nothing: Marks are stored as
fractions of the drawing, so a Tavola re-scanned at any resolution keeps every evening of marking
done on it. `pnpm scans:measure` reads back what ingest has recorded about every scan and applies
both thresholds by itself. The question is answered by running one command against a system that
has real drawings in it, whenever that is.

**Two things the real sheet did confirm**, both of which the code had assumed without evidence:
it carries **~208 positions plus `210 S` and `211 D`**, so "a Tavola may carry two hundred
numbers" and "the number is an opaque string, suffix and all" are both borne out; and its
*Sezione*, *Gruppo* and *Sottogruppo* boxes are **printed but empty**, which is why those columns
are nullable.

And one it contradicted: **the factory did not print these numbers inside circles.** They are
bare numerals with thin leader lines running to the part. The practice archive's invented drawing
printed circles, so every screen in this repository had been built and judged against a friendlier
sheet than the real one — *since fixed: the invented drawing now prints bare numerals at the size
they measure on a real sheet, each with a leader line to a component of its own.* A Mark is a ring
drawn *around* the number rather than over a printed circle, which reads — but `MARK_RING` in
`drawing-viewer.tsx` was explicitly
"fitted to the circles the practice drawing prints ... for when there is something to measure it
against". There now is, and it has been used: at 0.055 the ring came out **44px on this sheet
against an 18–26px spacing between neighbours**, so each ring covered the numbers either side of
it and clipped an unmarked `153` down to `53`. It is now **0.030** — measured from a digit 10px
tall (0.0124 of the shorter side, over 349 of them) and the 21.5px diagonal of the widest number
the sheet prints. The fraction survives resolution, so the downsized copy was a fair ruler for
this even though it is no use for the legibility question above.

**Ticket 13 does not depend on any of this.** Its one open box needs an uncropped catalog *text*
page — the parts list with the `Codice` column — to settle which column is the Catalog Number and
which the Disegno Origine. That is one photograph of one page, not a scanning programme, and it
is what actually unblocks the volunteers.

**The fourth box is now closed.** It was open because a tick would have claimed stored data that
did not exist; ticket 05 placed the first Mark, and `marks.x` and `marks.y` are fractions of the
drawing in the database, in the API's contract and in the viewer's arithmetic alike. Re-scanning
a Tavola at any resolution costs nothing an Editor has already done. ADR 0013 carries the
commitment and the reason it is load-bearing.

Everything the ticket asks for in code is delivered.

**So the measurement was built instead of waited for.** Ingest records, for every scan it
accepts, the source format, the pixel dimensions and the byte size of the upload and of both
derivatives. `pnpm scans:measure` reads those back, applies the threshold, and says which way the
evidence points — including the more important question, whether the archive was scanned finely
enough for a position number to be legible at all. The question is now answered by running one
command against a system with real drawings in it. [ADR 0013](../../../docs/adr/0013-one-private-image-not-a-tile-pyramid.md)
records the decision, the threshold (**tile when more than half the drawings are over 3 MB to
open**) and why reversing it is cheap.

**The choice made in the meantime: one private image per Tavola, no pyramid.** The upload is kept
byte for byte, and two derivatives are written — the whole drawing as **lossless** WebP, and a
480px preview so listing a car's Tavole never downloads a drawing. Lossless because the archive's
entire value is that a sixty-year-old position number stays readable and the numbers are the
smallest, highest-contrast marks on the sheet; it was also 18% smaller than the source PNG on the
one genuine drawing available. Reversal stays cheap because Marks are fractional and the image
route is already the shape a tiled archive needs.

**The scans needed a gate, and there was none.** ADR 0006 requires an authenticated route in
front of every image, and Accounts and Memberships do not arrive until ticket 14. So this ticket
builds M1's "single hard-coded admin login" from the spec: one shared passphrase in
`EDITOR_PASSWORD`, a signed cookie, no server-side session store. Unset admits **nobody** rather
than everybody, and `assertSafeForEnvironment` **refuses to start production while it is set** —
the way a stand-in becomes permanent is that nobody gets round to replacing it, and this one
guards the Club's drawings.

**And the whole archive is behind it, not only the images.** The first attempt gated the scans
and the Editor's writes and left the catalog readable — which the ticket's own first paragraph
rules out ("none of it is reachable by anyone not signed in"), and rightly: a Tavola's number,
its two names and the factory's own Sezione are the Club's archive as much as the drawing is,
and an open catalog is a catalog a search engine indexes. What stays open is what has to be —
`/api/status`, so a member can see the database is down, and the session routes themselves,
since asking to be let in cannot require already being in. Ticket 15 replaces *who* is admitted,
not what the gate stands in front of.

**What is on the screen.** Sign-in; the catalog, with each car now a link; a Model page laid out
as a **contact sheet** of plates, because that is how anyone with a box of drawings finds the one
they want; a Tavola page where the drawing gets the full measure of the page, with the factory's
Sezione / Gruppo / Sottogruppo beside it as evidence; and three Editor forms. Two things fell out
of looking at the rendered screens rather than the code: an empty plate was drawn as white paper,
which made a car's *unscanned* Tavole the loudest thing on a dark page, and the "Sign in" link on
a plate did not carry the destination, so following it from a drawing lost the drawing — both
fixed, the second one caught by a Playwright test written for exactly that story.

**What `/code-review` changed.** The Tavola number was set in the Club's teal, which the visual
language reserves for four things and a static identifier is none of them. The upload trusted
the browser's `Content-Type`, so a `.tif` arriving with no type at all — routine — would have
been refused with a message about image formats, which is the one conversation story 94 promises
an Editor will never have; ingest now reads the bytes and the parser claims every type. The
accepted-format list existed twice, so a format could be ingested and then served as
`application/octet-stream`. The seeder had its own copy of "is this Category one we already
have". Request bodies were declared in both apps and had already drifted, so they moved into
`packages/contracts` beside the responses. `GET /api/categories` was built and used by nothing;
it now feeds the Category field's suggestions, which is the same rule the slug enforces, shown
rather than imposed. And the `original` variant was served to nobody by anything — ADR 0006 asks
that the upload be kept privately, not published, so it has no address at all now.

**Also built, because it was not optional:** a Category is a table keyed by a slug, so "Fuel
System" and "fuel system" are one Category across every car rather than two; a Tavola's number
sorts by its numeric prefix, so a list reads 2, 10, 12 rather than 10, 12, 2; and `pnpm db:seed`
now draws its own invented tavole in SVG, since there is no real scan in this repository and
there should not be.

**42 new tests at the API seam and 5 at the browser seam.** The browser ones are only what a
request and a response cannot prove: that the scan actually renders, that a signed-out browser is
told why rather than shown a broken picture, and that a deep link survives the gate.
