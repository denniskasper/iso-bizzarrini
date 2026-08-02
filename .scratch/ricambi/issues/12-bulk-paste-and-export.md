# 12 — Bulk paste and spreadsheet export

**What to build:** An Editor transcribing a catalog page enters a whole Tavola's table at once
rather than filling in 200 separate forms — and can pull a Tavola back out into a spreadsheet
whenever they want to work the way they always have.

This is the concession that keeps spreadsheet-native Editors productive without making a
spreadsheet the source of truth. Losing an Editor is worse than any schema decision.

**Blocked by:** 06 — Parts, Listings, and reading a part from a circle.

**Status:** ready-for-agent

- [ ] An Editor pastes tabular rows for one Tavola and they become Parts and Listings
- [ ] Columns map to Catalog Number, Position, both names, quantity, Disegno Origine and drawn/undrawn
- [ ] A preview shows what will be created and what will be matched to an existing Part **before** anything is written
- [ ] Rows whose Catalog Number already exists are matched to the existing Part rather than duplicating it
- [ ] Rows that cannot be parsed are reported with their line, and do not block the rest
- [ ] A Tavola's Parts and Listings can be exported to a spreadsheet
- [ ] Export round-trips: an exported sheet can be pasted back without creating duplicates
- [ ] This is an **editing convenience only** — it is not the permanent catalog importer, which is deliberately out of scope
- [ ] UI and design work uses the `/frontend-design` skill
