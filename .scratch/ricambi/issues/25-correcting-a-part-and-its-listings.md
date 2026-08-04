# 25 — Correcting a Part and its Listings

**What to build:** An Editor changes what the archive says about a Part, and where it is listed,
without removing anything and typing it again. Recording a Part is done; correcting one is not
possible at all, and three later tickets already assume it is.

**Blocked by:** 06 — Parts, Listings, and reading a part from a circle.

**Status:** done

- [x] All nine of a Part's fields are editable — both names, Catalog Number, Disegno Origine, Description, Dimensions, Material/Finish, Catalog Note and Note
- [x] A Catalog Number can be **added** to a Part that has none, **corrected**, or **cleared** — "this Part has no factory number" must stay expressible
- [x] Editing to a Catalog Number another Part already holds is refused the same way entering one is (ADR 0001): the existing Part is surfaced, and it is **correct-only** — see the Comments, since merging two Parts that both already exist is the operation this ticket defers
- [x] Before saving, the screen says **how many Tavole the edit will change** — a Part is one thing, so correcting it changes every sheet it is listed on at once
- [x] A Listing's **quantity per car**, **drawn/undrawn** flag and **Position** are editable
- [x] A Part that already exists can be **listed at a new Position** (story 103) without re-describing it
- [x] An Editor finds an existing Part by **Catalog Number** (exact, ignoring the printed spacing) or by a **prefix of either name**, and sees which Tavole each is already listed on
- [x] That lookup also surfaces Parts **listed nowhere**, so an orphan is findable rather than invisible
- [x] A Part can be removed, and removal is **refused while it is still listed** — the Listings go first, so nothing destroys work on a sheet the Editor is not looking at
- [x] 06's collision flow stops being a dead end: *List that part here* hands the Editor into editing the Part they merged into, instead of discarding what they had typed
- [x] Playwright coverage: a correction reaches a member's screen, a Catalog Number edited into a collision is refused, and a Part listed nowhere can be found and removed
- [x] UI and design work uses the `/frontend-design` skill

## Why this exists

**Three later tickets already assume it, and none of them builds it.** Ticket 20 says *"An Editor
edits the Part record **directly** while reviewing"* and *"Editors' own catalog edits do not enter
the queue — they have edit rights and simply make the change"*. Ticket 19 says *"corrections reach
the record through an Editor"*. The spec's own Out of Scope says the same: *"corrections reach the
record through an Editor's hands."* Every one of those sentences is true of a capability that does
not exist. Ticket 20's `Blocked by` now names this one.

**Two trapdoors close here, and both were found by reading 06 back rather than by using it.**

The first: the form that records a Part only ever sends a *new* one. The single path that lists an
Part the archive already has is the Catalog Number collision — so a Part with **no** Catalog
Number cannot be listed at a second Position at all, and an Editor who removes a Listing by
mistake cannot put it back. "Remove and record it again" is the workaround 06 leaves behind for
every correction, and for most Parts it is not a workaround but a one-way door.

The second: removing a Part's **last** Listing leaves a Part with none — invisible on every
screen, reachable from nothing, and still holding its Catalog Number. Retype that number and the
archive refuses and points at a Part the Editor cannot see, open or remove. It is the same phantom
the transaction in 06 was added to prevent, arrived at deliberately instead of by accident. The
lookup showing Parts listed nowhere is what makes it recoverable.

## What is deliberately not here

**A true Part-merge** — folding two Parts that already exist into one. ADR 0001's *"forces a merge
or a correction"* describes resolving a collision **at the point of entry**, which is what 06 built
and what this ticket finishes; it does not describe reconciling two Parts that are already in the
archive. That operation asks questions this ticket does not have to answer: which Part's fields win
field by field, what happens when both are listed at the same Position on the same Tavola (the
unique constraint refuses it), and what becomes of the loser's id once ticket 07 has put ids into
links members share. It is deferred, and it is deliberately left unnamed rather than described in
words that would suggest it exists.

**Search.** The lookup here is an Editor's tool for listing a Part again — Catalog Number and
names, nothing else. **Ticket 22 owns Search** and reaches further: Disegno Origine, Equivalent
references, the member's results page. The two overlap on one rule, *match a number regardless of
the spacing used in the query*, and **that is a debt rather than a design**: two implementations of
one matching rule is exactly the inconsistency this product exists to remove, and the spec's own
argument is that consistency comes from the system rather than from discipline. Ticket 22 must
absorb this lookup when it lands; it should not be left standing as a second search.

**A new word in `CONTEXT.md`.** Considered and rejected. Every entry there is a *thing* — Model,
Tavola, Position, Mark, Part, Listing — and an edit leaves no trace in the model: there is no
Revision, no history and no per-field audit trail (ticket 20: *"their hand is the audit trail"*).
A glossary noun for something with no representation would be inventing vocabulary rather than
recording it. The one word worth watching is **Contribution**, which belongs to what a *Member*
offers and carries a review state; an Editor's own change is never one.

**Locking.** Two Editors correcting one Part at the same moment: last write wins. With a handful of
Editors that is the honest cost, and it is recorded here so that nobody has to work out later
whether it was decided or overlooked.

## Comments

**Delivered.** The Part became an addressable thing rather than something only reachable through a
drawing: `GET`, `PATCH` and `DELETE /api/parts/:partId`, plus `GET /api/parts?q=` for the lookup
and `PATCH /api/listings/:listingId` for where a Part sits on one sheet. No migration — every
column this needed already existed, which is the shape ticket 06 chose paying off.

Three decisions worth recording, none of which the ticket settled:

**The refusal on the correction screen offers no merge**, unlike the one recording a Part gets.
There, merging means listing the existing Part *here*, which is one press and loses nothing. On a
correction both Parts already exist, and folding them together is the true Part-merge this ticket
explicitly defers — so the screen says the number belongs to something else and stops, rather than
offering a button that half does it.

**"Remove" became "Remove from this position".** Once removing a *Part* existed a few pixels away,
a button that did not say which of the two it meant was a trap: one is undone in a press and the
other takes an evening's work off drawings nobody is looking at. Removing the Part itself lives
inside the correction panel, where the archive can refuse it while anything still lists it and say
why.

**How far a correction reaches is answered by the API, once.** `GET /api/parts/:partId` carries
`listedOn` — one entry per *Tavola*, not per Listing, since a washer at four numbers on one drawing
changes one drawing. The alternative was counting distinct sheets out of `elsewhere` in the
browser, in two places, which is the same rule implemented twice.

**Two things the review caught, both fixed here.** Correcting where a Listing sits re-read only
the number the Editor was looking at, so a Listing moved from `12` to `44` went on showing at both
for the thirty seconds the cache holds — `useRereadMovedListing` re-reads every number on the
sheet, because the one a Listing left is not derivable from where it landed. And removing a Part
counted its Listings and then deleted, over a foreign key that cascades: a Listing recorded by
another Editor between the two statements would have been destroyed by the very rule that exists
to protect it. The condition is now inside the `delete`.

**One thing found on the way, left alone deliberately.** The marking tool advances the number in
its field when the archive *answers*, not when the click happens — so two clicks inside one round
trip place two circles at one number. That is `held`'s behaviour arrived at by accident rather
than by asking, it belongs to ticket 05 rather than here, and it is worth its own ticket. What
this ticket did was stop the Playwright suite depending on losing that race: `placeMarks` in
`e2e/support/archive.ts` waits for each circle, which several specs had been getting away with
only because the machine was fast enough.

**The debt this ticket names is still a debt, and is now real.** The lookup matches a Catalog
Number with the printed spacing squashed out of it, which is a rule ticket 22 will implement a
second time unless it absorbs this. The matching lives in `part-repository.findParts` behind one
method, and there is deliberately no index on the squashed number: a few thousand Parts do not need
one, and an index would be a surface to build on rather than something to remove.
