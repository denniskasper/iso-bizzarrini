# 06 — Parts, Listings, and reading a part from a circle

**What to build:** A member clicks a numbered circle and reads the Part — beside the drawing, not
instead of it. This is the sentence the whole product exists to complete: *choose your car, open
the drawing, click the position, read the part.*

**Blocked by:** 05 — Positions and the marking tool.

**Status:** ready-for-agent

- [ ] A Part carries Name (EN), Denominazione (IT), Catalog Number, Disegno Origine, Description, Dimensions, Material/Finish, Catalog Note and Note
- [ ] **Catalog Note is a separate field from Note** and is never merged with it in display or editing — factory evidence and club interpretation stay distinguishable
- [ ] Catalog Number is optional; a Part without one is fully legitimate and the interface says so plainly rather than showing a placeholder
- [ ] Entering a Catalog Number that already exists surfaces the existing Part and forces a merge or a correction — it is never silently duplicated
- [ ] Disegno Origine is displayed prominently and is not required to be unique
- [ ] A Listing places a Part on a Tavola, optionally at a Position, with a **quantity per car** and a **drawn/undrawn** flag
- [ ] The same Part listed on two Tavole can carry different quantities
- [ ] Clicking a circle shows the Part beside the drawing, with the drawing still visible
- [ ] Several **drawn** Parts at one Position render as *alternatives* — visibly different from **undrawn** Parts at the same Position, which render as *also needed*
- [ ] The Part shows which Model, Tavola and Position it is being read at
- [ ] The Part shows which other Tavole it appears on
- [ ] UI and design work uses the `/frontend-design` skill
