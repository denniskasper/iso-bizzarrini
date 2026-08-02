# 11 — Editor progress view

**What to build:** An Editor opening a Tavola can see immediately what is left to do on it —
which Positions have no Mark, and which have no Listing.

Marking hundreds of Tavole is volunteers' evenings, and nothing kills that work faster than not
knowing where you stopped.

**Blocked by:** 05 — Positions and the marking tool; 06 — Parts, Listings, and reading a part.

**Status:** ready-for-agent

- [ ] For a Tavola, an Editor sees how many Positions exist, how many carry a Mark, and how many carry a Listing
- [ ] Positions with no Mark are listed, so an Editor can work through them
- [ ] Positions with no Listing are listed separately — these are the gaps members will also see
- [ ] Unmarked and unlisted Positions are distinguishable at a glance on the drawing itself
- [ ] A Model-level view shows progress across all its Tavole, so work can be prioritised
- [ ] The view is fast enough to open casually on a Tavola with 200+ Positions
- [ ] UI and design work uses the `/frontend-design` skill
