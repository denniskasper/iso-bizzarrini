# 07 — Two-way navigation

**What to build:** A member can work from the drawing to the text *and* from the text to the
drawing, jump straight to a number they already know, see at a glance what is not yet recorded,
and send someone a link that opens exactly what they are looking at.

**Blocked by:** 06 — Parts, Listings, and reading a part from a circle.

**Status:** ready-for-agent

- [ ] A list of the Tavola's Parts sits beside the drawing, so a member can work from the text
- [ ] Selecting a Part in that list moves the drawing to its Mark
- [ ] A Position printed in several places cycles through its Marks on repeated selection, so the member learns the part is used more than once
- [ ] A member can type a Position number to jump to it
- [ ] Typing matches by numeric prefix, so `210` finds `210 S`
- [ ] Positions with **no Listing** are visibly marked as not yet recorded, so "not known" is distinguishable from "not yet clicked"
- [ ] A link to a specific Position can be copied and opens exactly that Position for another member
- [ ] Playwright coverage: list-to-drawing navigation, Mark cycling, and a deep link opening the right Position
- [ ] UI and design work uses the `/frontend-design` skill
