# 10 — Part photographs

**What to build:** A member can look at a photograph of the Part and confirm visually that it is
the one in their hand — the check no part number can give them.

Also establishes the file-upload and private-serving machinery that member Contributions reuse
later.

**Blocked by:** 06 — Parts, Listings, and reading a part from a circle.

**Status:** ready-for-agent

- [ ] An Editor uploads one or more photographs to a Part
- [ ] Photographs are stored **privately**, on no public path, and served through the same authenticated route as tiles
- [ ] Images are resized and converted to a modern format on upload; originals are retained
- [ ] Photographs display when reading a Part, and can be viewed larger
- [ ] Photographs can be reordered and removed
- [ ] Upload size and file type are limited and validated server-side
- [ ] The upload path is reusable by member Contributions in ticket 19
- [ ] UI and design work uses the `/frontend-design` skill
