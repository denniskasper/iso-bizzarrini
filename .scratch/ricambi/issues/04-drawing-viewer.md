# 04 — The drawing viewer

**What to build:** A member opens a Tavola and can actually read it — the whole drawing at first,
then zoomed in far enough to make out a position number on a phone, in a garage, without losing
track of where they are.

This is the product's defining surface. If it is unpleasant, nothing else matters.

**Blocked by:** 03 — Model, Tavola, scan ingest and private tiles.

**Status:** done

- [x] The whole drawing fits the screen when it opens, every time
- [x] Zoom and pan by mouse, trackpad and touch
- [x] Zooming in makes small position numbers legible on a phone
- [x] A navigator overlay shows which part of the drawing is currently in view
- [x] Full-screen view available
- [ ] Only the visible tiles are fetched, so the whole scan is never downloaded to open a drawing — *there are no tiles: ADR 0013, decided at ticket 03, serves one private image per Tavola. What this box was protecting is delivered; see Comments*
- [x] Panning stays responsive on a mid-range phone
- [x] Tavole are listed for a Model by number with both names — *delivered at ticket 03; the contact sheet is unchanged and is covered at the browser seam*
- [x] First real Playwright coverage: fits on open, zooms, and remains usable at several zoom levels
- [x] UI and design work uses the `/frontend-design` skill

## Comments

**The one open box is the tile box, and it is open because there are no tiles.** ADR 0013 —
decided at ticket 03, from the fact that no real scan has ever been measured — serves **one
private image per Tavola and no pyramid**, and this viewer pans and zooms that image
client-side. Ticking a box that says "only the visible tiles are fetched" would claim a delivery
format this system does not have.

What the box was actually protecting is delivered, and it is worth separating the two halves:

- **Listing a car's Tavole never downloads a drawing.** The contact sheet has always used the
  480px preview; `Plate` now has no way to ask for anything else, because the display variant it
  used to take belonged to a viewer that did not exist yet and does now.
- **Opening a drawing fetches one derived image, never the upload.** The original has no address
  at all (ticket 03), so the worst case is one lossless WebP, cached immutably for a year, and
  panning re-requests nothing.

What is *not* delivered is the part that only tiles can give: on a very large scan the whole
image still arrives before the drawing is sharp. The mitigation is that the **480px preview is
drawn first, at the drawing's full size**, and it is already in the browser from the contact
sheet the member just came through — so the sheet is on screen immediately and sharpens rather
than appearing late. `pnpm scans:measure` is what reopens this, against real drawings, and the
viewer is written so that reopening it costs nothing here: `viewport.ts` works internally in the
scan's own pixels, but the region it *reports* is **fractional**, which is the same commitment
ADR 0013 makes for Marks. Nothing that leaves the viewer knows how a scan was delivered.

**How far in it goes, and why that is the legibility promise.** The maximum is *one image pixel
per CSS pixel, or four times the fitted view, whichever is further*. The first term is the real
answer to "can a position number be read on a phone" — at native resolution the smallest mark
the factory printed is as large as the scan can make it, and no delivery format does better. The
second is for a drawing small enough to nearly fit already, where stopping at native resolution
would be barely a zoom. This is asserted at the browser seam on the Pixel 7 rather than argued:
at full magnification the drawing is on the glass at no fewer pixels than it was scanned at.

**Responsiveness is architectural, and it is the one box with no assertion behind it.** Where the
drawing sits never enters React state: gestures write to a ref, one animation frame later the
transform is written to the element, and React re-renders only when the member enters full screen
or the drawing arrives. `translate3d` is the only property that moves, so nothing re-runs layout.
The nearest observable proof is a test that drags 120px and asserts the sheet moved exactly
120px; no frame rate is measured, and on this seam none honestly could be.

**Full screen is two mechanisms because one of them does not exist on iOS.** Safari has no
`requestFullscreen` for an element, so the stage fills the viewport by itself and the native API
is asked for as well where it exists. The browser seam runs the fallback path — headless Chromium
refuses the native request — which is how it caught that `scrollbar-gutter: stable` reserves a
strip a fixed element cannot cover: full screen was full screen except for a bar of chrome down
one edge.

**The defect worth recording.** A mouse drag on the drawing died about fifteen pixels in. Chromium
was starting its own native image-drag, which cancels the pointer — so the sheet twitched and
stopped, and every image in the viewer needed `draggable={false}`. It is invisible to the API
seam and to reading the code; the browser seam found it on the first run, which is the argument
for the seam.

**Two things came from looking at the rendered screens rather than the code.** The stage was
paper white, so a scan — which is white to its own edges — had no visible edge and a member
panning could not tell the sheet from the surround; it is now the sunken surface, a light table,
and the drawing is still the brightest thing on a dark screen because the drawing is what is
white. And "fit the whole drawing" and "full screen" were both corner-bracket icons, which at the
size an icon is actually drawn is one icon twice; full screen now wears arrows.

**What is on the screen.** The sheet on a light table, with one instrument panel in the corner a
thumb reaches — magnification, in and out, fit, full screen — and a navigator that is **not there
until part of the drawing is off screen**, because a navigator that always says "all of it" is
chrome that never earned its place over the artwork. The navigator dims what is *not* in view
rather than outlining what is, so it needs no legend; pointing at it moves the view there. No
accent anywhere in the viewer: none of these is the dominant action on a screen whose dominant
thing is a drawing.

**Beyond what was asked, deliberately.** Keyboard pan, zoom, fit and full screen with
`aria-keyshortcuts`; double-tap to zoom in at the tap and out at the top; the preview-first
placeholder above. The keyboard is not scope creep — this repo's own rules make the viewer a
control surface, and one that only a mouse can operate is one an Editor cannot work through.
Pointing at the navigator to move the view is a convenience for a hand, which is why it is
announced as the picture it is rather than added to the tab order as a control that would do
nothing useful when focused, and why the "usable at every zoom level" test also drags.

**Wheel zooms rather than scrolls, and that is a decision.** It is what the specification's own
choice of OpenSeadragon does, and what a member who has used a map expects; the sheet is moved by
dragging it, which is what a member who has used paper expects. The cost is that a trackpad's
two-finger scroll zooms instead of panning, and panning on a trackpad means a click-drag.

**Nine tests at the browser seam, on desktop and on a phone**, all of them assertions about where
the drawing actually is on the glass rather than about the viewer's internals: it fits on open and
again when the phone is turned over, it magnifies to the scan's own resolution, it follows a
pointer one-to-one and stops at the edge of the sheet, it zooms about the pointer under a wheel,
it never shows blank paper at an edge at any zoom level, the navigator appears and says where you
are, fit gives the whole sheet back, and full screen fills the screen and gives it back. Pinch is
the one input with no test: two-finger gestures are not something Playwright can produce, and a
synthetic pair of pointer events would be testing the test.

**What `/code-review` changed.** The `image, frame` pair travelled through all ten geometry
functions and is now one `Stage` — worth doing here because ticket 05 places Marks against the
same arithmetic. Full screen's three effects moved into `useFullScreen`. `drawn` was a local
name for "the image has loaded", which is a word `CONTEXT.md` reserves for whether a Part is the
one a Position points at, and the lucide `Scan` icon was shadowing the domain's Scan in the one
file that has both. The navigator is pointed at, so it now carries the same 44px floor every
other control does however long and thin the sheet inside it is — with the map kept at the
drawing's exact proportions inside it, so the lit rectangle still lands where the member is
looking. And an Editor replacing a scan carried the old magnification onto the new drawing; the
viewer is keyed by the scan, so a new sheet opens at the whole of it.
