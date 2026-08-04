# 13 — Migration scripts for the existing archive

**What to build:** The Club's existing spreadsheets and scans become real Models, Tavole, Parts,
Listings, Fitments, Equivalents and Sources in the system.

**This is the ticket that unblocks the volunteers.** Until it lands, marking Tavole has nothing to
attach to; after it lands, the long pole of the project can run in parallel with everything else.

**Blocked by:** 03 — Model, Tavola, scan ingest and private tiles; 08 — Fitments, Equivalents and
Sources.

**Status:** ready-for-human

- [x] Migration scripts live in version control and are **re-runnable** — running twice does not duplicate
- [x] The existing spreadsheets are transformed into Models, Tavole, Parts and Listings
- [x] The repeating vehicle block in the source sheets becomes Fitments with their qualifiers
- [x] Fixed supplier and OEM columns are mapped to typed Equivalents; the kind assigned for each is recorded
- [x] Source columns become Sources; any price without a date is loaded without the price, not with an undated one
- [x] The `Related Parts` column becomes symmetric Related Position links
- [x] The `Sub-Assembly` and its position ranges become Sub-assemblies
- [x] Scans are ingested and tiled in bulk — *ingested in bulk; there are no tiles to make, see Comments*
- [x] A dry-run mode reports what would be created, matched and skipped, without writing
- [x] A report lists every row that could not be loaded and why — nothing is dropped silently
- [ ] Which catalog column is the Catalog Number and which the Disegno Origine is **confirmed against an uncropped catalog page before loading begins** (see the spec's Further Notes) — *needs a person with a catalog page; the loader refuses to run until they have written down what they saw*
- [x] Marks are **not** loaded — no existing data records where a Position sits on a scan; that work is human

## How each was met

**One command, and the loop it is built for.** `pnpm archive:load -- --source ../club-archive
--dry-run`, read the report, correct the sheet, run it again without `--dry-run`. The material is
a directory outside this repository — `plan.json`, `tavole.csv`, `parts.csv` and `scans/` — and
only the loader and the plan format are versioned here, because the archive is the Club's and
`AGENTS.md` keeps its contents out. The procedure is
[`docs/operations/archive-migration.md`](../../../docs/operations/archive-migration.md).

**The dry run is the load, rolled back.** Not a projection of it: the same code writes the same
rows through the same constraints inside one transaction, and the transaction is abandoned at the
end. So "what it would create" is what it *did* create, and a load that would fail on a constraint
fails in the rehearsal rather than half way through the real thing. That is also what made the
repositories take a `DbSession` — the pool, or a transaction on it — rather than the pool itself.

**Re-runnable means find-or-add everywhere, and never overwrite.** Parts are matched by Catalog
Number, which is ADR 0001 doing the deduplicating; Tavole by their Model and number; Listings by
part, sheet and Position; Sources — which have no unique constraint, deliberately, because the
same shop at two prices is a price history — by the same offer at the same price on the same day.
The strongest thing a re-run does to a record that exists is fill a field that is *empty*. ADR
0005 exists because a bulk import that silently overwrites curated work is how an archive loses
it, and this one structurally cannot.

**A Part with no Catalog Number is the interesting case.** It is matched by the Listing it
produced last time — same drawing, same number, same words — which is also how the commonest
*correction* lands: adding a missing `Codice` to a row that loaded without one gives that Part its
number instead of recording a second one beside it, which the Position screen would otherwise
print as two alternatives a member has to choose between. The limit is written down rather than
papered over: rename such a Part through the screens and a later run records a second one, and the
report shows it as a created Part where a matched one was expected. Matching looser would merge two
genuinely different unnumbered screws at one Position, which is worse and much harder to notice.

**Refusals and warnings are two different things, and both are in the report.** A row is
*rejected* — not loaded at all — when it names a Model or a Tavola that does not exist, when it
has neither an Italian nor an English name, or when its `Drawn` cell says neither. That last one
is strict on purpose: several *drawn* Parts at a Position are alternatives and *undrawn* ones are
fixings needed as well, so a guess there is the wrong parts arriving in the post. Everything else
loads and the loss is *warned* about — `a.r.` in a quantity column, a related number that is not
on the sheet, a Position a second Sub-assembly also claimed, a named scan that is not in `scans/`.
Both lists carry the file and the line number the volunteer can go and look at.

**The price rule survived contact with a spreadsheet.** A price with no date beside it is loaded
as *no price* — the Source still arrives, because where a part has been available is worth more
than what it cost on a day nobody wrote down, and a 2011 figure printed today reads as this
morning's. The same for a price in a currency nobody can read: those four are a check constraint
and the whole load is one transaction, so a cell reading `Lire` passed through would not be a bad
row in the report — it would be the entire archive rolled back with no report written at all.

**Two judgements the sheets cannot settle are declared in the plan and printed in the report.**
Which catalog column is which, and which way round the dates are written: nothing in a cell can
tell `03/04/2025` apart, and warning about every such row would bury the report in warnings about
dates that are almost certainly fine. So the plan says, once, and the report says what it did.

**Two tables had to be built to load two columns.** The `Related Parts` and `Sub-Assembly` columns
are in the club's sheets and this ticket asks for both, but ticket 09 — which owns them — had not
run. So `sub_assemblies`, `positions.sub_assembly_id` and `related_positions` are added here, with
the rules in the schema rather than in screens: a Position carries at most one Sub-assembly
because it is a column and not a join table, and a Related Position link is one row in ascending
order because a check constraint refuses any other arrangement — so a sheet that records the link
from both ends records it once. **Nothing reads them yet.** Showing them to a member and letting
an Editor record one is ticket 09, which is now half built and correspondingly cheaper.

**"Tiled in bulk" names something this system does not have.** ADR 0013 serves one private image
per Tavola and no pyramid, so the scans are ingested in bulk through exactly the path an Editor's
upload takes — measured, converted, stored privately, addressed by scan id. A Tavola that already
has a scan is left alone: re-ingesting would give the drawing a new address and throw away every
browser's cached copy of it.

**The open box is the one code cannot close.** The loader refuses to run until `plan.json` says
which uncropped catalog page settled the Catalog Number / Disegno Origine question and what it
showed, and it prints that sentence back at the top of every report. What it cannot do is look at
the page. Getting that pair backwards is one Part where there should be two, permanently — which
is why the refusal is a refusal and not a warning.

**CSV rather than a workbook**, because *File → Save as CSV* costs a volunteer one menu item and
the result can be read, diffed and quoted in an e-mail — where a workbook parser would sit in the
production image for the sake of a command run a handful of times. The one concession to reality
is a configurable delimiter, since a machine that writes `24,50` exports with semicolons.

**17 tests at the API seam** (`apps/api/tests/archive-migration.test.ts`), against a real Postgres
with a source directory invented per test and thrown away. Where the claim is "the spreadsheets
became the archive", the assertion is made over real HTTP — car, drawing, number, part — because
that is a claim about what a member can open rather than about which rows were inserted.

**What `/code-review` changed.** Three of them were the same shape — a re-run that is safe for the
same file twice is not automatically safe for the file *corrected*, which is the loop this loader
exists for. A row that gained a `Codice` recorded a second Part; a quantity corrected from `a.r.`
to `2` never landed, because a matched Listing had no fill path where a matched Part did; and a
currency read from a column was the one cell in the loader that was cast rather than read, so an
unreadable one would have taken down the transaction and produced no report. Also: a dry run
applied outstanding database migrations, which is writing whatever it is called — it does not any
more. The six copies of the find-or-add shape in the writer became one, and the report stopped
claiming a maker came "from the cell" when the plan had named a column for it.

## Comments

**What is left is a page and a person.** Everything the ticket asks for in code is delivered and
run; the eleventh box needs somebody with access to the Club's material to photograph one
uncropped catalog page, decide which column is which, and write the sentence into `plan.json`.
Until they do, the loader will not load — which is the intended behaviour and not a blocker to
work around.

**And it is one page, not a scanning programme.** The page wanted is a *catalog text page* — the
parts list carrying the `Codice` column — and not a Tavola. This ticket needs **no scans at all**:
`scans/` may be empty, a Tavola with no drawing is a legitimate state, and the spreadsheets are
what the volunteers are waiting on. Ticket 03's deferred measurement is a separate job against
different material and does not gate this one. (An earlier note here said the two were the same
afternoon's work. They are not, and reading them as one is what would keep the volunteers waiting
on a scanner.)
