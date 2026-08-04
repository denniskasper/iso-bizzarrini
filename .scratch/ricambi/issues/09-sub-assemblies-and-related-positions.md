# 09 — Sub-assemblies and Related Positions

**What to build:** A member looking at one part can see what belongs with it — both the named
group it sits in, and the specific part it works against.

These are two different questions and need two mechanisms. A Sub-assembly is the broad group
(*Window Slider*, eleven Positions); a Related Position is the narrow, hand-picked pointer from
the guide rod to the one part it actually works with.

**Blocked by:** 06 — Parts, Listings, and reading a part from a circle.

**Status:** ready-for-agent

- [ ] An Editor groups Positions into a named Sub-assembly within one Tavola
- [ ] A Position belongs to at most one Sub-assembly; no nesting
- [ ] A Sub-assembly has no number and cannot be ordered — it is a label, explicitly **not** a bill of materials
- [ ] A member can see which Positions belong to a Sub-assembly, and highlight them together on the drawing
- [ ] An Editor links two Positions in the same Tavola as related
- [ ] The link is **symmetric** — recorded once, visible from both ends, so nobody has to remember to enter it twice
- [ ] Related Positions appear when reading a Part
- [ ] A Position in no Sub-assembly simply shows nothing, rather than falling back to every other Position on the drawing
- [ ] UI and design work uses the `/frontend-design` skill

## Comments

**Half of this is already in the database, and it arrived sideways.** The club's spreadsheets carry
a `Sub-Assembly` column and a `Related Parts` column, so [ticket 13](13-migration-scripts.md) had
to have somewhere to put them: `sub_assemblies`, `positions.sub_assembly_id` and
`related_positions` exist, the migration writes them, and the two structural rules this ticket
asks for are enforced by the schema rather than by whoever builds the screens — a Position belongs
to at most one group because membership is a column and not a join table, and a link is one row in
ascending order because a check constraint refuses any other arrangement, so recording it once is
the only thing that can happen.

**Nothing reads any of it.** No route, no response shape, no screen, and no way for an Editor to
record either by hand. That is the whole of what is left here, and it is what every unticked box
above is about.
