# 22 — Search

**What to build:** A member holding a bracket with a number stamped on it can find out what it is
— without knowing which car it came off or which drawing it belongs to.

Every other route into the archive starts at the car. Half the time a restorer starts at the part.
And the cross-reference content only pays off **in reverse**: someone holding a modern bearing
marked `6205` wants to know what it replaces.

**Blocked by:** 08 — Fitments, Equivalents and Sources.

**Status:** done

- [x] Search by Catalog Number
- [x] Search by Disegno Origine
- [x] Search by **Equivalent reference** — OE supplier, OEM and industry-standard numbers
- [x] Search by Name (EN) and Denominazione (IT)
- [x] Exact and prefix matching; **no relevance ranking**
- [x] Numbers match regardless of the spacing used in the query, since the printed forms carry spaces
- [x] Results show which Model and Tavola each Part belongs to, so a member can tell which one is theirs
- [x] A result leads straight to the Part in the context of a Tavola and Position
- [x] Search is Postgres-only — no external search engine
- [x] **Notes, Catalog Notes and Contributions are deliberately not searched**
- [x] Search returns nothing to a member without a live Membership — *as far as the archive can
      currently tell.* There are no Memberships yet; `/search` is behind the same gate as every
      other route, and ticket 15 replaces who that gate admits.
- [x] UI and design work uses the `/frontend-design` skill

## How each was met

**One matching rule, in one file.** `catalog/part-matching.ts` is what "this query names that Part"
means, said in SQL: numbers compared with the spacing and case taken out of both sides, names
compared as written with the case ignored, and everything matched from the beginning and never from
the middle. It sits beside `part-identity.ts` and shares `catalogNumberKey` with it, so the rule
that `260 03 150` and `26003150` are the same number is the same rule whether it is deciding that a
pasted row has been met before or that a member has found something.

**The Editor's lookup was absorbed rather than left standing beside it**, which is what ticket 06
and the router both asked for. `GET /api/parts?q=` and `GET /api/search?q=` now run the same
`searchParts`, so the lookup reaches Disegno Origine and Equivalent references too, and it gained
prefix matching on numbers in the process — a widening, recorded in `part-corrections.test.ts`
where the old exact-only rule was asserted. What still differs is only what each *reports*: Search
names every number a Part sits at, because a member wants the right circle; the lookup names one
row per **sheet**, because an Editor about to correct a Part is deciding how far the correction
reaches.

**"No relevance ranking" is honoured, and a number typed in full still comes first.** Nothing is
scored, weighted or tuned. A single boolean — did the query name a number and no more of it — lifts
whatever it is true of, and everything below it is the catalog's own order. It is asked of **all
three** numbers rather than of the Catalog Number alone, because a member quoting a Disegno Origine
out of a letter has typed something they already know just as surely as one reading a catalog's
first column, and promoting one of the three would let *where the number came from* decide how far
down the list it lands. The same query twice gives the same list in the same order.

**The reverse lookup says why it matched.** A member typing `6205` gets back a name they have never
heard of, so the answer carries `matchedEquivalents` — the references the query actually hit, and
nothing else the Part holds. Without it there is nothing to compare the bearing in their hand
against. It is empty for a Part found by its own number or name, because then there is nothing to
explain.

**A result leads to a circle, not to a sheet.** Each match carries one `SearchListing` per Listing
rather than per Tavola, so a washer at three numbers on one drawing offers three places to go, and
each is a link into `/tavole/:id?position=…` — the address ticket 07 already made shareable. A Part
listed on no drawing comes back with an empty list and says so plainly: hiding it would have the
archive answer "nothing matches" to a number it is still refusing to anyone who types it.

**Behind the gate, and that is load-bearing here.** `/api/search` sits under `router.use(editorsOnly)`
with everything else. An open search address is the one thing that would hand a crawler the whole
archive a number at a time (ADR 0006).

**But the Membership half of that requirement is not built and cannot be here.** There are no
Accounts and no Memberships until tickets 14 and 15, so what is enforced today is the stand-in
shared-passphrase gate, and both seams assert what is actually true: a browser that has not been
through it is answered `401` and shown nothing. A lapsed member being turned away is ticket 15's
to add, at the gate, where it will cover Search along with everything else — the box above is
ticked for *where* the check happens, not for a Membership check that exists.

**Deliberately not searched.** The prose — Note, Catalog Note, description, dimensions, material —
is out of reach by construction rather than by omission, and the API seam asserts each. So is an
Equivalent's *maker*: the ticket names the reference, and searching the maker would answer
"Fiat 124 Coupé" with every Part ever fitted to one, which is a fitment question this ticket does
not ask. The screen says what is searched **before** anything is typed, because a member who does
not know the limits reads an empty answer as "the archive has not got it".

**Known consequence, recorded rather than fixed:** a Donor Vehicle Equivalent usually has no
reference at all — that nullable column is the whole point of it (ticket 08) — so a member who
knows the same hose was on a Fiat 124 cannot reach it by typing that. Searching an Equivalent's
*maker* would answer "Fiat 124 Coupé" with every Part ever fitted to one, which is a fitment
question this ticket does not ask. Worth a ticket of its own if members ask for it.

**The screen.** `/search`, with the query in the address so an answer is shareable and reloadable.
Results are set as a printed parts index — the factory's number in the first column, in the mono
face every identifier here wears, names beside it — because a member comparing a stamping against a
screen is reading down that column. The field is a labelled box and one button, which is the spec's
own example of a tool rather than a feature. It is reachable from the chrome on every screen and
from a plain line on the catalog front door; the front door keeps one dominant action, so that line
is a link and not a second form.

Twenty-four tests at the API seam (`apps/api/tests/search.test.ts`) and six in the browser
(`apps/web/e2e/search.spec.ts`, run by both the desktop and the phone project, so thirty-six runs).
The browser ones cover only what a request and a response cannot: that a number stamped on a
bracket ends with the member looking at the circle it came from, that the reference which found a
part is on the screen beside it, and that a search link survives the gate.
