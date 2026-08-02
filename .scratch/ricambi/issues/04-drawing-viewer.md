# 04 — The drawing viewer

**What to build:** A member opens a Tavola and can actually read it — the whole drawing at first,
then zoomed in far enough to make out a position number on a phone, in a garage, without losing
track of where they are.

This is the product's defining surface. If it is unpleasant, nothing else matters.

**Blocked by:** 03 — Model, Tavola, scan ingest and private tiles.

**Status:** ready-for-agent

- [ ] The whole drawing fits the screen when it opens, every time
- [ ] Zoom and pan by mouse, trackpad and touch
- [ ] Zooming in makes small position numbers legible on a phone
- [ ] A navigator overlay shows which part of the drawing is currently in view
- [ ] Full-screen view available
- [ ] Only the visible tiles are fetched, so the whole scan is never downloaded to open a drawing
- [ ] Panning stays responsive on a mid-range phone
- [ ] Tavole are listed for a Model by number with both names
- [ ] First real Playwright coverage: fits on open, zooms, and remains usable at several zoom levels
- [ ] UI and design work uses the `/frontend-design` skill
