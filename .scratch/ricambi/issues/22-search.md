# 22 — Search

**What to build:** A member holding a bracket with a number stamped on it can find out what it is
— without knowing which car it came off or which drawing it belongs to.

Every other route into the archive starts at the car. Half the time a restorer starts at the part.
And the cross-reference content only pays off **in reverse**: someone holding a modern bearing
marked `6205` wants to know what it replaces.

**Blocked by:** 08 — Fitments, Equivalents and Sources.

**Status:** ready-for-agent

- [ ] Search by Catalog Number
- [ ] Search by Disegno Origine
- [ ] Search by **Equivalent reference** — OE supplier, OEM and industry-standard numbers
- [ ] Search by Name (EN) and Denominazione (IT)
- [ ] Exact and prefix matching; **no relevance ranking**
- [ ] Numbers match regardless of the spacing used in the query, since the printed forms carry spaces
- [ ] Results show which Model and Tavola each Part belongs to, so a member can tell which one is theirs
- [ ] A result leads straight to the Part in the context of a Tavola and Position
- [ ] Search is Postgres-only — no external search engine
- [ ] **Notes, Catalog Notes and Contributions are deliberately not searched**
- [ ] Search returns nothing to a member without a live Membership
- [ ] UI and design work uses the `/frontend-design` skill
