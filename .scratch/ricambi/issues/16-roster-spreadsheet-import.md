# 16 — Roster spreadsheet import

**What to build:** An Administrator loads the Club's membership list from a spreadsheet instead of
typing it. This is the one permanent import in the product, because it genuinely recurs and has no
curated state underneath it to destroy.

**Blocked by:** 14 — Accounts, Memberships, roster and invitations.

**Status:** done

- [x] An Administrator uploads a spreadsheet of members with names, e-mail addresses and Paid-through dates
- [x] The import **adds and updates only — it never deletes**. A truncated or partial file can never lock out the membership
- [x] A preview shows exactly what will be created and what will be changed before anything is written
- [x] Rows matching an existing Account by e-mail update that Membership rather than creating a second Account
- [x] Rows that cannot be parsed are reported individually and do not block the rest
- [x] Importing does **not** send invitations; inviting stays a separate, deliberate act
- [x] Removing someone's access is an explicit action, never a side effect of an import
- [x] Date formats are validated rather than guessed; an ambiguous date is a reported error
- [x] UI and design work uses the `/frontend-design` skill

## Comments

**Delivered.** Nine boxes, at both seams: 29 tests at the API seam (459 in total, up from 430) and
two in the browser. `POST /api/roster/import/preview` and `POST /api/roster/import`, an
Administrator's like the rest of the roster, and `/roster/import` in front of them.

**The preview and the write are one reading.** `plan()` takes a `DbSession`, so the caller decides
whether that is the pool — a preview, which writes nothing — or the transaction the write happens
in. Importing re-plans inside the transaction and then carries that plan out, which is the same
argument bulk paste and the archive migration both make: a preview cannot promise something the
write does differently, because there is one implementation rather than two free to disagree.

**"It never deletes" is structural rather than checked.** There are four outcomes and none of them
removes anybody; `carryOut` contains no statement that could. Somebody the file does not mention is
counted as `untouched` and left alone, and the count is on the screen with a sentence of its own,
because the ordinary accident here is a truncated export and the thing an Administrator needs to
read is what did *not* happen. A file naming an earlier date is `unchanged` and says why — a term
is never shortened, which closes the same hole from the other side.

**Dates are read from the evidence in the file rather than declared or guessed.** `03/04/2027` is
the 3rd of April on one machine and the 4th of March on another, and a guess is a hundred
Memberships silently a month wrong. So: a cell that reads only one way reads that way; an ambiguous
cell is read in the order **the rest of its column has proved** (one `31/12/2027` settles the whole
column); and an ambiguous cell in a column that proves nothing is refused *naming both readings*,
so the fix is to write that one cell as `2027-12-31`. This is deliberately stronger than the
migration's `DateOrder`, which is a declaration in a plan file — right for one export somebody
writes a plan for, wrong for a file an Administrator uploads and will not write one for.

**Four things it will not do, on purpose.** It sends no invitations — a list arriving is not a
reason to e-mail a hundred people, and a new member lands as `invited` for an Administrator to
invite one at a time. It appoints nobody: there is no role column and `carryOut` writes `member`,
because appointing an Editor is story 129's decision on the roster screen. **It does not rename
anybody the roster already has** — a name corrected on the roster screen is curated, and next
spring's export, written before the correction, would put the old one back in bulk with no record
of what was lost; that is the exact failure ADR 0005 exists to prevent, so the difference is
*reported* and the press that applies it stays on the row that owns it, which is what bulk paste
does with a quantity. And it never touches a Part, a Listing or anything else in the archive; this
is the one permanent import in the product and ADR 0005 says exactly why it is the only one.

**A new Membership grant.** `roster-import` joins `opening-entry` and `bank-transfer` (migration
0010) rather than being folded into the first. When a member says the Club has their date wrong,
whether it was one Administrator's assertion about one person or a row in a file of two hundred is
the first thing anybody looking into it wants to know.

**Two things were shared rather than copied.** The column normaliser and the first-column-wins
matching moved from `catalog/tavola-table.ts` into `sheets/csv.ts`, and the date grammar in
`sheets/cells.ts` is now one `splitDate`/`asDay` pair serving both the migration's declared order
and this one's proved one — two date readers were two chances to disagree about what a date is.

**Two things `/code-review` changed, both about the boxes rather than about style.** The import
renamed matched Accounts, which the checklist never asked for — it says a matching row updates
*that Membership* — and which ADR 0005 argues against; it now reports the difference instead. And a
row that could not be read claimed its e-mail address, so a bad date on line 5 turned a perfectly
good line 40 about the same person into a second refusal — which is the box *"do not block the
rest"* failing on the case it was written for. Only a row that will actually do something claims an
address now.

**Ticket 15's surface walk earned its keep.** `authorisation.test.ts` reads the router rather than
a list somebody maintains, and it failed the moment these two addresses existed, because a lapsed
member met `forbidden` where it expects `membership_lapsed`. That is the right answer — the roster
is behind the role and not behind a Membership — so the addresses joined `ADMINISTRATORS_ONLY`,
which is a one-line change made by a test that would otherwise have said nothing.

**The browser seam earned its keep twice, too.** It caught a preview that ran and then dropped its
own result on the floor — the plan never reached the screen, which no API test could have seen. And
it caught the garage rule measuring the wrong element: a file picker is a `<label>` in front of a
visually-hidden `<input>`, `sr-only` leaves that input a 1×1px box, and Playwright counts a 1px box
as visible. The sweep over the Administrator's screens now skips hidden controls, and the label a
cold hand actually presses is measured where the picker is used.

**Known and accepted.** The file is read in the browser and posted as text rather than uploaded as
a document. That keeps one sheet reader serving the catalog's pastes and this, keeps the archive
out of guessing what a file was, and costs nothing an Administrator can see — they pick a `.csv`
from a picker either way. A workbook (`.xlsx`) is not read, which is the same decision `sheets/csv.ts`
already records: *File → Save as CSV* costs a volunteer one menu item and a parsing library in the
production image costs more than that.
