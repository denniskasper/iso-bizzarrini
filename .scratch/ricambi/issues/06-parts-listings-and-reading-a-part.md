# 06 — Parts, Listings, and reading a part from a circle

**What to build:** A member clicks a numbered circle and reads the Part — beside the drawing, not
instead of it. This is the sentence the whole product exists to complete: *choose your car, open
the drawing, click the position, read the part.*

**Blocked by:** 05 — Positions and the marking tool.

**Status:** done

- [x] A Part carries Name (EN), Denominazione (IT), Catalog Number, Disegno Origine, Description, Dimensions, Material/Finish, Catalog Note and Note
- [x] **Catalog Note is a separate field from Note** and is never merged with it in display or editing — factory evidence and club interpretation stay distinguishable
- [x] Catalog Number is optional; a Part without one is fully legitimate and the interface says so plainly rather than showing a placeholder
- [x] Entering a Catalog Number that already exists surfaces the existing Part and forces a merge or a correction — it is never silently duplicated
- [x] Disegno Origine is displayed prominently and is not required to be unique
- [x] A Listing places a Part on a Tavola, optionally at a Position, with a **quantity per car** and a **drawn/undrawn** flag
- [x] The same Part listed on two Tavole can carry different quantities
- [x] Clicking a circle shows the Part beside the drawing, with the drawing still visible
- [x] Several **drawn** Parts at one Position render as *alternatives* — visibly different from **undrawn** Parts at the same Position, which render as *also needed*
- [x] The Part shows which Model, Tavola and Position it is being read at
- [x] The Part shows which other Tavole it appears on
- [x] UI and design work uses the `/frontend-design` skill

## Comments

**The Catalog Number collision is the feature, and the API is shaped around saying so.**
`POST /api/tavole/:id/listings` carries *either* an existing Part's id *or* a whole new Part, never
both and never neither. A number the archive already holds comes back as a `409` carrying **the
Part that has it**, because an Editor cannot merge into something they have not been shown — and
the screen turns that refusal into two buttons, *List that part here* and *Correct the number*.
There is deliberately no third way past it, since the third way is how a parts archive ends up
with two of everything (ADR 0001). The check happens by being refused by the database rather than
by a read-then-write, so two Editors typing the same number at the same moment cannot both pass.

**Almost every column on a Part is nullable, and that is the archive being honest rather than
lax.** Much of what will arrive is a description and nothing else. The one thing a Part may not be
is nameless — a row that would render as a blank line in a list of components is not a Part — and
a check constraint enforces it rather than a convention. `catalog_number` is unique *when present*,
which is exactly what a Postgres unique constraint over a nullable column already means: any
number of Parts may have none.

**The quantity is on the Listing and not on the Part**, so the same washer is four here and two
there without being split into two Parts. That is also what makes "which other Tavole does this
Part appear on" worth reading: the practice archive lists one bolt on two sheets in two counts,
and the panel says so.

**The reading was bounded to the drawing's height for about an hour, and the browser caught it.**
A column beside the sheet, scrolling inside itself, keeps the drawing on screen no matter how long
the Part is — which sounds like exactly what "beside the drawing, not instead of it" asks for. What
a full-page screenshot showed is that it put the *undrawn* fixings below an invisible fold, so the
one distinction this ticket exists to make was the thing hidden. The column now runs at its natural
height. The drawing leaves the top of the screen if a member reads far enough down four Parts, and
that is the better trade: nothing is hidden, and at the moment of the click — which is what story
44 is about — both are on the glass.

**Two columns only where there is a beside.** Below `lg` the reading is the next thing down the
page. A phone given a second column would have a drawing too small to read a number off and a
column too narrow to read a sentence in, so it gets neither.

**The difference between an alternative and an addition is carried three times over**, because
getting it wrong is the wrong parts arriving in the post: by the order (drawn first, decided in the
database rather than in the browser), by a heading in plain words — *Fitted instead of one another.
The car takes one of these, not all of them.* — and by a **broken rule** down the side of an
undrawn Part, which is the same mark the sheet's own numbers already wear for "listed but not
drawn". The browser seam asserts the computed `border-left-style`, because "visibly different" is
not something a response body can prove.

**Evidence is boxed and interpretation is not.** The Catalog Note sits in a ruled block labelled
*From the factory catalog*; the club's Note is plain prose below it. Two columns in the database,
two fields in the form, two blocks on the screen, and nothing anywhere that concatenates them —
which is the point, since a member deciding what to buy is weighing one against the other.

**What the full test suite caught that nothing else would have.** `emptyCatalog` truncated Models
and Categories and relied on the cascade — but a Part has no column pointing at a Model (that is
ADR 0001, restated as a foreign key that does not exist), so every Part survived the truncation and
the second `pnpm db:seed` collided on the first Catalog Number it wrote. Seeding twice is now a
test.

**A Part and its first Listing are one transaction, and that is not tidiness.** They were two
statements until `/code-review` asked what happens when the second fails: the Part is recorded, it
keeps its Catalog Number — which is unique across the whole archive — and the Editor's retry is
refused and pointed at a phantom Part listed nowhere. The dedup mechanism turned against itself,
reachable by a dropped connection or by a Position deleted between the check and the insert. It is
one `db.transaction` and it has no test, because there is no way to make the second insert fail
through HTTP and this suite does not mock its own code.

**One rule this ticket invents, named because no box asked for it.** A Part must have a name in
one of the two languages, enforced by a check constraint rather than by convention. Nothing in the
spec says so; the argument is that a row with neither name renders as a blank line in a list of
components and no member could do anything with it. Worth revisiting at ticket 13 if the
spreadsheets turn out to hold rows carrying a description and nothing else.

**The Listing uniqueness rule has a hole, and it is deliberate for now.** `(part, tavola,
position)` cannot catch a duplicate when the Position is null, because Postgres counts two NULLs
as different — so the same Part could in principle be listed twice on one Tavola at no Position.
Nothing creates such a Listing today: the screens always name a Position. The partial index that
closes it belongs with ticket 07, which is what first gives a Tavola's position-less Listings
somewhere to be seen. The schema comment says so rather than claiming more than it does.

**"Merge" is the honest word for what the button does, and it is narrower than it sounds.** *List
that part here* attaches the Part that already holds the number; it does **not** fold in the
description, dimensions or notes the Editor had just typed, because there is no way to edit a Part
after it is recorded — story 101 is "enter", and editing appears in no box here. An Editor who
mistypes a Description today removes the Listing and records the Part again. That is the sharpest
gap this ticket leaves and it should be the first thing 07 or 08 picks up.

**Beyond what was asked, and said plainly.** Removing a **Listing** is in no box above. It is here
for the same reason removing a Position was at ticket 05: a Listing recorded at the wrong number is
otherwise permanent, and an archive where mistakes are expensive is one Editors work slowly in. It
is one route, one button in the Editor's panel, and it is the only scope added. Relatedly, a
Position removed with Listings on it does **not** take them with it — the Listings stay on the
Tavola with no Position, a state the model already has, because a mistyped number is cheap and an
evening of part data is not.

**What is deliberately *not* here.** Nothing lists a whole Tavola's Parts, and a Position with no
Listing is not yet marked as such in the sheet's own list of numbers — both are ticket 07, which
puts the Tavola's Parts beside the drawing and distinguishes *not known* from *not yet clicked*.
Cycling through a Position's several Marks is 07 as well. A **position-less Listing** is in the
model, the API and the tests but reachable from no screen, for the same reason: the only place it
could be entered or read is a list of the Tavola's Parts, which 07 builds.

**What else `/code-review` changed.** `NewPart` was the nine Part fields written out a second time
and is now derived from the wire shape, so a tenth field cannot be added to one and forgotten on
the other. The query key `['position-listings', id]` was written literally in the reading panel and
in the Editor's, which is two screens quietly drifting apart — it is one hook now. `CONTEXT.md`
reserves *part number* near Catalog Number and *component* near Part, and both had got into the
copy. `ListedElsewhere` carried the Italian name of the other Tavola through three layers and
rendered it nowhere. And `alreadyRecorded()` sat beside `<AlreadyRecorded>` differing only in case.

**The panel beside the drawing is called "Position" and the Editor's is called "What sits at 12".**
That reads like a copy choice and started as one: the browser seam refused both, because
`region name: "Position"` matched "Parts at position 12" too and ticket 05's tests broke. Two
regions a screen reader announces as "Position…" are one thing said twice, so the second was
renamed rather than the test loosened.
