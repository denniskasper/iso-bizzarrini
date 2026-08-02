# Scans, tiles and photographs are private and served behind authentication

Members contribute their knowledge on the understanding that only paid-up members can see the
archive. A single public image URL breaks that promise for the whole scanned collection, and
search engines index what they find. So the original scans, the generated deep-zoom tiles and
member photographs are never on a public path.

Image data is served through an authenticated route — Caddy's `forward_auth` asks the
application to validate the session and a live Membership before any file is served — with
long, immutable cache headers so that panning around a drawing re-requests almost nothing. At
this membership's scale the per-request check costs nothing, and revocation stays immediate,
which is what "access blocked on expiry" requires.

**Decided, in [ADR 0013](0013-one-private-image-not-a-tile-pyramid.md): one private image per
Tavola, no tile pyramid** — and ingest now records every scan's dimensions and byte sizes, so
the measurement this ADR wanted is taken by the archive itself rather than by hand. The section
below is the reasoning that deferral rested on, kept because the threshold in 0013 is measured
against it.

## Whether the scans are tiled is deliberately not decided here

This ADR fixes **privacy and access**, not the delivery format. Deep-zoom tiling was chosen on
an assumption — A3-at-300-dpi scans — that nothing has yet verified. **No real scan has been
measured.** A prior implementation of this product drove a plain pan/zoom viewer with no tiling,
but only ever against artificial sample images, so it is evidence about neither the archive nor
the viewer's adequacy.

The choice is therefore made in the ingest ticket, against **real** scans: tile if they are
large enough that sending a whole one to a phone on poor reception actually hurts; otherwise
serve one private image and pan/zoom client-side. Either way the file is private and
authenticated, and Marks are stored in fractional image coordinates so the decision can be
reversed without re-marking anything.

## Consequences

A plain CDN cannot be put in front of the images without solving signed cookies first. The known
lever, if it ever matters, is a short-lived token minted when a member opens a Tavola — faster,
but it weakens revocation to the token's lifetime. Do not "optimise" delivery by making the
storage public.
