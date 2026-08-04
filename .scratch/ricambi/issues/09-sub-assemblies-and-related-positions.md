# 09 — Sub-assemblies and Related Positions

**What to build:** A member looking at one part can see what belongs with it — both the named
group it sits in, and the specific part it works against.

These are two different questions and need two mechanisms. A Sub-assembly is the broad group
(*Window Slider*, eleven Positions); a Related Position is the narrow, hand-picked pointer from
the guide rod to the one part it actually works with.

**Blocked by:** 06 — Parts, Listings, and reading a part from a circle.

**Status:** done

- [x] An Editor groups Positions into a named Sub-assembly within one Tavola
- [x] A Position belongs to at most one Sub-assembly; no nesting
- [x] A Sub-assembly has no number and cannot be ordered — it is a label, explicitly **not** a bill of materials
- [x] A member can see which Positions belong to a Sub-assembly, and highlight them together on the drawing
- [x] An Editor links two Positions in the same Tavola as related
- [x] The link is **symmetric** — recorded once, visible from both ends, so nobody has to remember to enter it twice
- [x] Related Positions appear when reading a Part
- [x] A Position in no Sub-assembly simply shows nothing, rather than falling back to every other Position on the drawing
- [x] UI and design work uses the `/frontend-design` skill

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

## How each was met

**Both travel with the sheet, and every write answers with the whole of it.** `Sheet` in
`packages/contracts` is the new shape — the Positions in the catalog's order and the Tavola's
Sub-assemblies — and both `TavolaResponse` and `PositionsResponse` are it. That is not tidiness:
recording a link changes *two* Positions because there is one row, and a Sub-assembly stops
existing when its last number leaves it, so neither outcome is derivable from the request that
caused it. A browser handed only what it asked about would be a panel naming a Sub-assembly the
archive no longer holds.

**Membership is written in one place and read in one place.** `Position.subAssemblyId` is the
whole fact; `SubAssembly` carries an id and a name and nothing else. There is no `positionIds` on
the group, because that would be the same fact twice and free to disagree the moment a number
moves — and there is no field to order a Sub-assembly by, which is *"not a bill of materials"*
enforced by the shape rather than by a rule somebody remembers. A test asserts exactly that: the
object has two keys.

**A link is one row, and Postgres decides which end is which.** `least`/`greatest` order the pair
in SQL rather than in JavaScript, because a `uuid` is a value with its own ordering and not the
text a client typed — `B1…` sorts below `a2…` in Postgres and above it in JavaScript, so ordering
the pair here would have handed the check constraint a row it refuses, for no better reason than
capitals in somebody's hex.

**Grouping is one transaction.** Finding or recording the name, moving the numbers in, and
sweeping whatever was left empty are one write, because two of the states between them are ones
the archive says cannot exist: a Sub-assembly with nothing in it, and a number that left one
without arriving in another.

**A Sub-assembly is recorded whole.** The example in this ticket is eleven Positions, so the
Editor's panel offers the sheet's numbers to be picked — with the one being read already picked —
and records them under one typed name in one press. Typing a name the sheet already uses adds to
that Sub-assembly rather than beside it; typing a different one at a number already in one *moves*
it, which is what an Editor naming it means.

**Each has a way back out, for the reason ticket 05 gave Marks one.** A Sub-assembly is recorded
in one press, so undoing it has to cost about one press: taking a number out undoes the press that
put it in, and dissolving undoes an eleven-number Sub-assembly named wrongly, which is otherwise
eleven presses. Both leave the numbers on the sheet — `sub_assembly_id` goes null rather than
cascading, because dissolving a name is not deleting what it was a name for.

**Seeing them together on the drawing recedes everything else.** The one accent already means
"the Position being pointed at", so a second set of circles wearing it would leave a member
working out which of eleven lit ones they were reading. Instead the circles that are *not* in the
Sub-assembly drop to `--mark-receded` — the one value in this interface deliberately below the
3:1 bar, argued in `docs/design/visual-language.md`, because it is the navigator's scrim applied
to circles: it is a state the member switched on, every circle stays hittable, and one press
brings the sheet back.

**A number in neither shows nothing at all** — no heading saying "none". On a sheet where most
numbers are in no Sub-assembly that would be a denial printed two hundred times, which is the same
argument the Part's own three lists make.

Twenty-four tests at the API seam (`apps/api/tests/sub-assemblies.test.ts`) and four in the
browser (`apps/web/e2e/belongs-with.spec.ts`), which carry what a response body cannot say: that
the group can be seen together *on the drawing*, and that a link recorded at one number is
reachable from the other. The practice archive now seeds a Sub-assembly of three numbers, one
number deliberately outside it, and one link — so both screens have something to be judged
against.
