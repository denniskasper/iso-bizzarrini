# 05 — Positions and the marking tool

**What to build:** An Editor works through a Tavola placing Marks on the numbered circles, and a
member sees those circles on the drawing. Nothing is known yet about what any of them are — that
is the point: marking up and entering part data are separate evenings' work, and a Tavola may sit
half-built indefinitely.

**This tool's speed is the project's critical path.** A Tavola can carry over 200 Positions, there
are hundreds of Tavole, and the work is volunteers' evenings. Placing a Mark must be one click.

**Blocked by:** 04 — The drawing viewer.

**Status:** ready-for-agent

- [ ] A Position belongs to a Tavola and exists independently of any Part
- [ ] Position numbers are stored **as printed**, including letter suffixes such as `210 S` and `211 D`, with a derived numeric sort key
- [ ] An Editor places a Mark by clicking the drawing — one click, no dialog
- [ ] A Position may carry **several Marks**, because the factory printed the same number wherever the part is used
- [ ] A Position may carry **no Mark**, meaning listed but not drawn
- [ ] Marks are stored in fractional image coordinates, so re-scanning at a different resolution does not invalidate the work
- [ ] A Mark can be moved or removed
- [ ] Marks render as fixed-radius circles pinned to the image, staying aligned at every zoom level
- [ ] Circles are large enough to hit with a thumb on a phone
- [ ] Playwright coverage: a Mark is clickable and lands on its Position at several zoom levels
- [ ] UI and design work uses the `/frontend-design` skill
