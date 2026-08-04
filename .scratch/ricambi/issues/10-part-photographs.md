# 10 — Part photographs

**What to build:** A member can look at a photograph of the Part and confirm visually that it is
the one in their hand — the check no part number can give them.

Also establishes the file-upload and private-serving machinery that member Contributions reuse
later.

**Blocked by:** 06 — Parts, Listings, and reading a part from a circle.

**Status:** done

- [x] An Editor uploads one or more photographs to a Part
- [x] Photographs are stored **privately**, on no public path, and served through the same authenticated route as tiles
- [x] Images are resized and converted to a modern format on upload; originals are retained
- [x] Photographs display when reading a Part, and can be viewed larger
- [x] Photographs can be reordered and removed
- [x] Upload size and file type are limited and validated server-side
- [x] The upload path is reusable by member Contributions in ticket 19
- [x] UI and design work uses the `/frontend-design` skill

## Comments

**Delivered.**

**The order is a feature, not a detail.** A Part with four photographs is not four equal
pictures: one shows what the component is at a glance and the rest are the casting number, the
end that always corrodes, the profile that tells the early one from the late. So a Photograph
carries a `sequence`, the first is set large on the panel a member reads and the rest are a strip
beneath it, and the Editor's panel says **Shown first** against the lead. An order whose
consequence is invisible is an order nobody has a reason to get right.

Reordering names the **whole order** in one request and is refused unless the ids are exactly the
Part's — a browser working from a list that has moved on gets a refusal rather than half an order
applied.

**One ingest, two recipes** (`images/image-ingest.ts`). A scan and a photograph are the same thing
to ADR 0006 and different things to an encoder: the drawing stays lossless because the position
numbers are the smallest marks on the sheet, the photograph is WebP at quality 82 and bounded to
2400px on the long edge because a member is confirming a shape. `storage/stored-images.ts` and
`http/served-image.ts` are the other two thirds — writing the three files under one prefix and
taking them back if the row does not land, and one set of cache, ETag and `Vary` headers. The
Scan and the Photograph services now share all three rather than each carrying a copy.

**What ticket 19 actually inherits, stated precisely**, because the criterion is easy to read as
more than it is. Those three modules are reusable as they stand; everything above them is
Part-shaped and should be. A Contribution's photographs need their own table (the FK here is
`part_id NOT NULL`, deliberately — a nullable polymorphic owner would be speculative now), their
own service and route, and a visibility rule this serving route has nowhere to express: *"Nobody
else sees it until it is published."* That is a *second* owner reusing the machinery, not a
parameter left open — which is what makes the criterion met rather than a table made vague in
advance of a requirement.

**Not a caption field.** The acceptance criteria do not ask for one and a photograph is announced
by the Part's name and its place in the order, which is enough for a screen reader and honest
about what the archive knows. Ticket 19 brings words with pictures anyway, attributed to whoever
wrote them.

**One bug fixed on the way through, in shared code.** `--animate-rise` used
`animation-fill-mode: both`, which retains `transform: none` as an identity matrix — and an
identity matrix is still a transform, so every panel wearing `animate-rise` was a containing block
for `position: fixed`. Anything trying to fill the screen from inside one was clipped to the
panel. The token is now `backwards`, which is visually identical (the `to` state *is* the
element's resting state) and leaves no transform behind. The drawing viewer's own full-screen
fallback — the iOS Safari path, where there is no `requestFullscreen` to rescue it — was subject
to the same clipping and is fixed by the same change, though nothing in this ticket tests that
path.
