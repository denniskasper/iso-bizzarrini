# 12 — Bulk paste and spreadsheet export

**What to build:** An Editor transcribing a catalog page enters a whole Tavola's table at once
rather than filling in 200 separate forms — and can pull a Tavola back out into a spreadsheet
whenever they want to work the way they always have.

This is the concession that keeps spreadsheet-native Editors productive without making a
spreadsheet the source of truth. Losing an Editor is worse than any schema decision.

**Blocked by:** 06 — Parts, Listings, and reading a part from a circle.

**Status:** done

- [x] An Editor pastes tabular rows for one Tavola and they become Parts and Listings
- [x] Columns map to Catalog Number, Position, both names, quantity, Disegno Origine and drawn/undrawn
- [x] A preview shows what will be created and what will be matched to an existing Part **before** anything is written
- [x] Rows whose Catalog Number already exists are matched to the existing Part rather than duplicating it
- [x] Rows that cannot be parsed are reported with their line, and do not block the rest
- [x] A Tavola's Parts and Listings can be exported to a spreadsheet
- [x] Export round-trips: an exported sheet can be pasted back without creating duplicates
- [x] This is an **editing convenience only** — it is not the permanent catalog importer, which is deliberately out of scope
- [x] UI and design work uses the `/frontend-design` skill

## Comments

**The preview and the write are one reading, and that is the load-bearing decision.** Applying a
paste re-plans the text against the archive *inside* its transaction and then carries that plan
out, so a preview cannot promise something the write does differently — the same argument the
archive migration makes about its dry run, and the reason there is one code path here rather than
two free to disagree. `POST .../paste/preview` and `POST .../paste` differ only in whether
`carryOut` runs.

**It creates and matches, and it never changes a Part.** ADR 0005 is explicit about why: re-uploading
the spreadsheet a Part came from would overwrite, in bulk and with no record of what was lost,
everything an Editor has since folded into it. So the paste path's only write to `parts` is an
insert — there is no update to reach, which makes the rule structural rather than a promise in a
comment. Correcting a Part is ticket 25's screen, where one Part is in front of one person.

**Identity is the archive's rule, not a rule invented for pasting.** A row with a Catalog Number
matches through `catalogNumberKey`, which squashes the printed spacing exactly as an Editor's
lookup does — the unique constraint cannot see that `26003150` and `260 03 150` are one number, so
without it the paste would record the duplicate ADR 0001 exists to prevent. A row **without** one
matches through `unnumberedPartKey`: where it sits on this sheet and what it is called, which is
the same key `archive-writer.findPartListedAs` expresses in SQL for the loader. Both now live in
`catalog/part-identity.ts` so there is one statement of each.

**Two unnumbered Parts under one name at one number are matched one to one.** They are an ordinary
state — several Parts at a Position are alternatives — and nothing tells them apart, so the key
names both. Holding one per key would drop the other, and then an exported sheet with two such rows
would come back with the second refused as a duplicate of the first: the round trip failing on
exactly the case that needed it. Each pasted row takes the first the archive holds that no earlier
row has taken.

**A row that disagrees with what is recorded says so.** Export, correct a quantity in Excel, paste
back: the Listing is already there and nothing is written, which is right. Saying nothing about the
difference would be the worse failure, because the Editor would believe the correction had landed.
So an `already-listed` row carries `why` when its quantity or drawn flag differs — and a *blank*
quantity is not a disagreement, because a blank cell is the sheet saying nothing rather than none.

**Two decisions about the Drawn column, both made because a guess there is the wrong parts arriving
in the post.** A sheet with **no** Drawn column has made no claim about any row, and the ordinary
catalog row is the drawn one. A sheet **with** one is read the way a tick column reads, so a blank
cell in it is that sheet saying *no*. What makes the second safe is that every row's drawn state is
on the preview before anything is written — it is shown per row, beside the quantity, and stated in
the hint under the box.

**Columns are recognised rather than declared**, which is the difference between this and the
migration's plan file. A loader is handed one export a handful of times and a person writes down
what its columns mean; an Editor mid-evening will not fill in a form about their own spreadsheet
first. So the header is read, what was made of it is reported back field by field, and the
consequences are shown — a stronger guarantee than a declaration, because it is checkable against
the rows themselves. The clipboard is tab-separated, a `.csv` off an English machine is
comma-separated and off a German or Italian one semicolon-separated; all three arrive in the same
box, so the header line is sniffed rather than the Editor asked.

**What the sheet reader gained, and where it moved.** `csv.ts` and `cells.ts` were under
`migration/`, which is a script that runs a handful of times and is deliberately not a product
feature. They are the Editor's now too, on every request, so they live in `sheets/` — with
`writeSheet` added beside `readSheet`, because an exported sheet has to be one this archive can read
back or the round trip creates two hundred duplicates. The columns written and the columns
recognised are one list, declared once in `catalog/tavola-table.ts`.

**A refusal mid-write takes the whole paste back off.** Another Editor recording one of the same
Catalog Numbers between the reading and the write aborts the transaction and answers with what
happened. Half a catalog page written is worse than none of it, and the Editor pastes it again
against an archive that now has that Part.

**Two things the review caught, both fixed here.** The unnumbered one-to-one matching above was the
first. The second was the preview naming no Part: a row read `Matched` and nothing else, which asks
an Editor to take the archive's word for which component it picked on the one screen where that
judgement is theirs. The row now shows the Part the archive holds, by name and number, beside what
the Editor's own row says.

**Three duplications the review named, all removed.** The Catalog Number squash was written twice
in one change; the Position sort key was computed by three callers, and is now derived inside
`positionRepository.findOrAdd` where no caller can get it wrong; and the column labels the browser
prints are built from one list rather than three.

**What is deliberately not here.** A paste refuses **whole** on an unclosed quote or two columns of
one name, rather than per row: neither leaves a way to say where a record ends or which column was
read, so every row after it is a guess. And nothing here reaches beyond one Tavola — this is
editing convenience per sheet, which is the whole of what ADR 0005 leaves in.
