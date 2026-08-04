# 11 — Editor progress view

**What to build:** An Editor opening a Tavola can see immediately what is left to do on it —
which Positions have no Mark, and which have no Listing.

Marking hundreds of Tavole is volunteers' evenings, and nothing kills that work faster than not
knowing where you stopped.

**Blocked by:** 05 — Positions and the marking tool; 06 — Parts, Listings, and reading a part.

**Status:** done

- [x] For a Tavola, an Editor sees how many Positions exist, how many carry a Mark, and how many carry a Listing
- [x] Positions with no Mark are listed, so an Editor can work through them
- [x] Positions with no Listing are listed separately — these are the gaps members will also see
- [x] Unmarked and unlisted Positions are distinguishable at a glance on the drawing itself
- [x] A Model-level view shows progress across all its Tavole, so work can be prioritised
- [x] The view is fast enough to open casually on a Tavola with 200+ Positions
- [x] UI and design work uses the `/frontend-design` skill

## Comments

**A sheet's own progress asks the archive nothing, and that is the whole answer to "fast enough
to open casually".** The drawing already arrives with every number on it, and the index beside it
already arrives with everything listed — between them they say all three counts and both lists, so
this is one pass over what the page is holding rather than a third request. A Model's sheets are
the opposite case and are counted in SQL, at `GET /api/models/:modelId/progress`: sixty drawings
read whole to produce three numbers each is sixty requests nobody waits for. The browser seam
builds a sheet of two hundred numbers and asserts that opening the panel costs **no request the
page did not already make**, and that all two hundred are named rather than the first few and a
count of the rest.

**So *marked* and *listed* are defined twice — once in SQL and once in TypeScript — and there is a
test whose only job is to keep them honest.** It derives the counts from the very two responses
the browser derives them from and asserts the aggregate agrees. That duplication is the price of
the panel being free, and it was worth paying; what was not acceptable was paying it silently.

**The counting rule that is easy to get wrong.** A number the factory printed in four places with
three Parts recorded at it is *one* number marked and *one* number listed. Joining to Marks and to
Listings at once would multiply those and count it twelve times, and `count(distinct …)` would
undo the damage only after the database had built the twelve rows. Each is its own `exists`, which
stops at the first hit on an index both tables already carry. A Listing at no Position at all
counts towards nothing, because it answers no number.

**"Unmarked and unlisted, distinguishable on the drawing itself" is half impossible, and the
screen says which half.** A Position with no Mark has *nothing on the sheet* — there is no circle
to mark differently, and inventing one would be drawing on a factory drawing. What the sheet can
distinguish is which of its circles have nothing recorded at them, and it does that by receding
every other circle: the same mechanism a Sub-assembly already uses, so "the bright ones are the
ones you asked for" needs no legend and nothing new wears the Club's accent. The numbers that are
on no circle at all are named in the panel instead, and the panel says so rather than letting an
Editor hunt the sheet for them.

**It is a switch and not a permanent state, deliberately.** Most of this archive is incomplete
today, so a drawing that lit its gaps by default would open with two thirds of itself receded —
the interface deciding what a member came to look at. That is one press away from what the box
asks for, and the trade is the right way round.

**The drawing answers one question at a time.** Showing a Sub-assembly and showing the gaps are
the same receding mechanism, so a sheet doing both would be bright circles meaning two different
things. Asking for either turns the other off, settled on the page rather than in the two panels
that ask — which is scope this ticket took on in ticket 09's mechanism, and is named here because
it changed behaviour that ticket already shipped.

**What `/code-review` caught that the tests did not.** The switch lives *inside* the list of gaps,
so recording a Part at the last one takes the switch off the screen — and a remembered flag would
have left every circle receding with the only control that could undo it gone. It is derived now,
the way a shown Sub-assembly already was, and keyed to the Tavola rather than to a boolean because
this component is not remounted when a member walks from one drawing to the next. There is a
browser test for it, and it was checked against the bug before it was checked against the fix.

**And a rule this ticket wrote and then broke on the screen.** The contract said `marked` is
"never a score out of `positions`", and the panel promptly printed `4 / 5` and drew a rule filled
to four fifths. The display is the useful one — the words were what was wrong. A number the catalog
lists that the factory never drew is finished with no circle on it, so a sheet **can be done
without either count reaching the whole**, and neither the contract nor the Model table may imply
otherwise. Both now say so out loud; what remains forbidden is calling the difference *outstanding*
or turning it into a percentage.

**The form is a printed tally, not a dashboard.** Counts right-aligned in the mono face this
archive sets every factory number in, ruled off like a catalog page, and beside each a hairline
rule that stops where the work stopped — the printed-index answer to a progress bar, at the same
2px weight the archive already rules a listed thing off with. It wears **no accent**: the teal
means the Position being pointed at and the one dominant action, and sixty tallies claiming to be
either would leave nothing on the page that still meant it. A sheet with no numbers on it gets a
dash and no rule at all, because an empty rule reads as "none of it done" about a drawing nobody
has opened.

**Beyond what was asked, and said plainly.** The Model table names a Tavola that has **no scan**.
It is in no box above, and it is the most useful line on the screen: a sheet with no scan cannot
be marked at all, so its empty counts are not an evening waiting to be spent but a scanner waiting
to be found — somebody else's job entirely. It costs no request and no column, being read off the
list of sheets the table is already given.

**What is deliberately *not* here.** Nothing orders the Model's sheets by how much is left. The
catalog's own order is the archive's rule and re-sorting it would be the screen answering
"which next" on the Editor's behalf, which is the one judgement they are better placed to make —
they know which sheets they have the paper for. And there is no whole-archive view across Models:
prioritising happens within a car, because that is where a run of evenings goes.

**One thing to settle that is older than this ticket.** `CONTEXT.md` lists *drawing* among the
words to avoid near **Tavola**, and the spec, the tickets and every screen built so far use it
constantly for the artwork as opposed to the record. This ticket's copy follows the neighbours
rather than diverging from them on its own. Either the avoid-list needs the word removed or a
sweep needs to happen; doing half of it in one panel would be worse than either.

**Who sees it.** The panel and the table are shown to whoever is signed in, because there is no
member/Editor distinction in the application yet — the stand-in gate admits Editors and nobody
else, and every editor affordance built so far (recording a Part, uploading a scan, filing a
Tavola) is shown the same way. Ticket 15 is what introduces an Account that may read and not
write, and this is on the list of things it has to put behind that line.
