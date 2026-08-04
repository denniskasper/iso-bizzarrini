# Migrating the Club's existing archive

The Club's parts knowledge is in spreadsheets and its drawings are in scans, and this is how
they become Models, Tavole, Positions, Parts, Listings, Fitments, Equivalents, Sources,
Sub-assemblies and Related Positions.

The decision behind it is [ADR 0005](../adr/0005-bulk-import-is-not-a-product-feature.md): there
is **no permanent spreadsheet importer** in this product, because re-uploading a sheet over
curated work overwrites it silently. The initial load is a migration — versioned here,
re-runnable, and run by a person who reads the report afterwards.

## What is versioned, and what is not

| | |
| --- | --- |
| In this repository | the loader (`apps/api/src/migration/`), the command, this procedure |
| **Not** in this repository | the exported sheets, the scans, and the `plan.json` describing them |

The archive is the Club's material and `AGENTS.md` keeps it out of version control. Keep the
source directory beside the checkout, not inside it, and keep it in the Club's own backup.

## The source directory

```
club-archive/
  plan.json        what the columns mean
  tavole.csv       one row per drawing
  parts.csv        one row per catalog line
  scans/           the drawings, named by the Tavole sheet
```

**CSV, not a workbook.** *File → Save as CSV* costs a volunteer one menu item, and the result is
a file that can be read, diffed and quoted in an e-mail by anybody — where a workbook would put
a parsing library in the production image for the sake of a command that is run a handful of
times. If the sheets were exported on a machine that writes `24,50`, set `"delimiter": ";"` in
the plan.

## The plan

`plan.json` says which column is which. It is a file rather than something compiled into the
loader because a renamed column in Excel should be a correction somebody makes beside their
export, not a code change, a review and a release.

```jsonc
{
  "delimiter": ",",
  // Which way round the sheets write 03/04/2025. Nothing in a cell can tell; the report says
  // which way it read them, beside the confirmation below.
  "dateOrder": "day-first",
  "catalogColumns": {
    // Refuses to load without this. See "The one thing code cannot decide", below.
    "confirmedAgainst": "Uncropped photograph of page 41, <ARCHIVIST>, 2026-07-14: the first column is the catalog number and the last is the disegno origine.",
    "catalogNumber": "Codice",
    "disegnoOrigine": "Dis. Origine"
  },
  "models": [
    {
      "key": "grifo",                 // how the sheets name this car in their Model column
      "brand": "Iso",
      "name": "Grifo",
      "series": "GL 365",
      "modelYears": "1965–68",
      "fitmentColumn": "Grifo"        // its column in the repeating vehicle block
    }
  ],
  "tavole": {
    "file": "tavole.csv",
    "columns": {
      "model": "Model", "number": "Tavola",
      "nameIt": "Denominazione", "nameEn": "Name", "category": "Category",
      "catalogSection": "Sezione", "catalogGroup": "Gruppo", "catalogSubgroup": "Sottogruppo",
      "scan": "Scan"                  // the file name inside scans/
    }
  },
  "parts": {
    "file": "parts.csv",
    "columns": {
      "model": "Model", "tavola": "Tavola", "position": "Pos.",
      "nameIt": "Denominazione", "nameEn": "Name",
      "quantityPerCar": "Q.tà", "drawn": "Drawn",
      "description": "Description", "dimensions": "Dimensions", "materialFinish": "Material",
      "catalogNote": "Catalog note", "note": "Note",
      "relatedPositions": "Related Parts",
      "subAssembly": "Sub-Assembly", "subAssemblyPositions": "Sub-Assembly Positions"
    },
    "equivalents": [
      { "column": "Girling", "kind": "oe-supplier", "maker": "Girling" },
      { "column": "OEM no.", "kind": "oem", "makerColumn": "OEM maker" },
      // A donor vehicle's column holds the car itself, and usually no reference exists.
      { "column": "Donor car", "kind": "donor-vehicle", "cell": "maker" }
    ],
    "sources": [
      {
        "name": "Ricambi Storici",
        "urlColumn": "Shop link", "priceColumn": "Shop price", "currency": "EUR",
        "observedOnColumn": "Shop seen", "conditionColumn": "Shop condition"
      }
    ]
  },
  "scans": { "directory": "scans" }
}
```

A column the plan names and the export does not have is refused **before anything is written**.
That is deliberate: an absent column reads exactly like a column of empty cells, so without the
check the archive would load with no quantities in it and say nothing.

## Running it

```sh
pnpm archive:load -- --source ../club-archive --dry-run   # writes nothing
pnpm archive:load -- --source ../club-archive             # loads it
```

Both write `archive-load-report.md` (`--report` moves it), and both exit non-zero when any row
was refused — a refused row is work left on the spreadsheet, not a failure of the load.

A **real** load applies any outstanding database migrations first, the way the application does
when it boots. A **dry run does not**, because it promises to write nothing and applying schema
changes is writing. If a rehearsal fails complaining about a column that does not exist, the
database is behind: run `pnpm db:migrate` and try again.

**The loop is: dry run, read the report, correct the sheet, run again.** The loader is
re-runnable by construction, so there is never anything to undo: a second run adds what was
missing and leaves everything else exactly as it is.

A dry run **is** the load. It writes every row through every constraint inside one transaction
and abandons the transaction at the end, so what it reports would-create is what it did create,
and a load that would fail on a constraint fails in the rehearsal rather than half way through
the real thing.

## How each thing is read

| Sheet | Becomes |
| --- | --- |
| The plan's `models` | Models, matched on brand, name and series |
| `tavole.csv` | Tavole with their Category and the factory's Sezione / Gruppo / Sottogruppo verbatim, matched on the Model and the number |
| The catalog columns | Parts, matched on the **Catalog Number** where there is one |
| Position, quantity, drawn | Positions and Listings, matched on the Part, the Tavola and the Position |
| The repeating vehicle block | Fitments. A tick (`x`, `✓`, `sì`) fits without qualification; **anything else is the qualifier, transcribed and never parsed** |
| Supplier and OEM columns | Equivalents of the kind the plan assigned, which the report prints back |
| Source columns | Sources — and **a price with no date, in no currency, or in one nobody trades in is loaded as no price at all** |
| `Related Parts` | Related Positions, one row per link, read from both ends |
| `Sub-Assembly` and its ranges | Sub-assemblies, resolved against the numbers the sheet actually has |
| `scans/` | Ingested through the same path an Editor's upload takes |

Several references in one cell are split on **semicolons and newlines only**: a supplier's
reference legitimately contains a comma, a slash and spaces, and splitting on those would invent
two part numbers out of one.

**Marks are not loaded.** No existing data records where a Position sits on a drawing, and
placing them is the project's critical path — an Editor's afternoon per sheet, in the marking
tool. Inventing them here would be inventing evidence.

## What it will never do

- **Overwrite.** It fills a field the archive has nothing in, and leaves every field that has
  something in it alone. Re-running the sheet a Part came from cannot undo what an Editor has
  since worked out about it. Filling covers a Part's prose and numbers, a Listing's quantity and
  a Fitment's qualification, and the report counts every field it filled.
- **Delete.** Nothing is removed, ever — including rows a later export dropped.
- **Duplicate.** Every write is a find-or-add.

## What it refuses, and what it merely reports

A **rejected** row is not loaded at all, and every one is in the report with its line number:

- a Model or a Tavola the plan and the Tavole sheet do not have;
- a Part with neither an Italian nor an English name;
- a `Drawn` cell that says neither. This one is strict on purpose: several *drawn* Parts at a
  Position are alternatives and *undrawn* ones are fixings needed as well, so a guess here is the
  wrong parts arriving in the post.

A **warning** is a row that loaded with something left out — an unreadable quantity (`a.r.`), an
undated price, a related number that is not on the sheet, a Position a second Sub-assembly also
claimed, a named scan that is not in `scans/`. Both lists are in the report; nothing is dropped
silently.

## The one thing code cannot decide

The catalog row reads `260 03 150 | 207 | ASTA GUIDA PER CRISTALLO MONTANTE | 2 | 208503`. The
draft spreadsheet labels the **first** column Disegno Origine; the conventional order of an
Italian factory catalog would make it the **last**. Both fields exist either way — what changes
is which one carries the uniqueness rule, and therefore which number the archive tells two Parts
apart by. Getting it backwards is one Part where there should be two, permanently.

One uncropped catalog page settles it, and only a person can look at one. So the loader will not
run until `confirmedAgainst` says which page was looked at and what it showed, and the report
prints it back with every load.

## The one thing to know about a second run

A Part **with** a Catalog Number is matched by it, wherever it appears. A Part **without** one —
a fastener the factory never numbered — is matched by the Listing it produced last time: the same
drawing, the same number, the same words. That is also how a *correction* lands: adding a missing
`Codice` to a row that loaded without one gives the Part its number, rather than recording a
second Part beside the first.

The limit of it: if an Editor **renames** an unnumbered Part through the screens, a later run will
not recognise it and will record a second one — which shows up in the report as a created Part
where a matched one was expected. Matching on anything looser would merge two genuinely different
unnumbered screws at one Position, which is worse and much harder to notice.
