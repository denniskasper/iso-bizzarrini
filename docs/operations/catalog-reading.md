# Reading the factory catalog by machine

The factory catalog exists only as scanned sheets. A command reads them and writes a directory of
plain files. `archive:load` turns that directory into **Unchecked** Tavole, which only Editors
see until one of them compares each with its sheets and publishes it. The decision and its
reasons are in [ADR 0016](../adr/0016-the-catalog-is-read-by-machine-and-published-by-an-editor.md).

## What it needs

- The catalog as a PDF, kept outside this repository. The command refuses an output directory
  inside it.
- Poppler's `pdftoppm` on the machine that runs it (`poppler-utils` on Debian and Ubuntu,
  `poppler` in Homebrew).
- Something to read with, either:
  - **a subscription login**: Claude Code (`claude`) installed and signed in with a plan
    (`claude auth login`). It is not charged, and it draws on the plan's usage limits. This is
    where reading starts (ADR 0016).
  - **an API key** in `ANTHROPIC_API_KEY`. It is billed per use. It is read from the environment,
    and it is never written to the output or printed.

  Where only one is there, the command uses it. Where both are, it refuses to start until it is
  told which, with `--with subscription` or `--with api-key`. A key that happens to be set never
  pays for a run meant for the subscription: it is taken out of Claude Code's environment, and a
  run Claude Code still reports reading with a key is refused.
- A spending limit in dollars, given with `--limit`. There is no default.

## Reading

```sh
pnpm catalog:read -- --pdf ../catalog.pdf --out ../catalog-reading \
  --brand Iso --model Rivolta --pages 5-120 --limit 20
```

`--pages` leaves out the front matter and the technical data, so they are never sent to the
model. The command first says what it is reading with, and whether that is charged. It prints
each Tavola as it reads it, the Table sheets it found and how many rows are in doubt. It ends with
the tokens it used and what they cost.

## When it stops part-way

A run stops cleanly at its spending limit, and on a subscription also when the plan's usage limit
is reached. The Tavole it finished are written and load as usual, and the rest are printed as not
read. Carry on later with the same command, `--resume` and a limit for what is left:

```sh
pnpm catalog:read -- --pdf ../catalog.pdf --out ../catalog-reading --pages 5-120 \
  --limit 10 --resume
```

It does not ask again about a page it has already placed (`pages.json` keeps what each page was
found to be), and it does not read a finished Tavola again. A Tavola it stopped in the middle of is
read again whole. The car comes from the directory, and a different PDF or car is refused. Each
Tavola records the Reading method that read it, so a run carried on with the other credential
leaves an honest record.

## What it costs

- **It estimates the whole run before it sends anything to be read.** With an API key, each
  page's requests are counted with the provider's free token-counting endpoint, exactly as they
  would be sent. A subscription login cannot use that endpoint, so its input is worked out from
  above instead: every image at its full size, the text at three characters a token, and Claude
  Code's own framing, all twice over, since Claude Code asks the model a second time after the
  structured answer. An
  answer cannot be counted before it is written, so each is allowed what it is expected to take
  (1,000 tokens to say what a page is, 8,000 to read a Table sheet, 2,000 to translate it). A
  Table sheet's Italian is unknown until it is read, so its translation is allowed 2,000 tokens of
  text. Which pages are drawings is only known once they have been asked, so every page is
  estimated as a Table sheet read twice and translated, and a catalog with drawings in it costs
  less than its estimate.
- **It refuses to start without `--limit`, or with an estimate above it**, and says why.
- **It never passes the limit.** Before each sheet it allows for the most that sheet could cost,
  which is every answer at its ceiling, translation included, and stops if that would pass the
  limit. Before a Tavola is translated, the translation itself is counted again and held to the
  limit the same way. So give the limit
  some room above the estimate. The Tavole it finished are written and load as usual. The rest are
  printed as not read. Carry on with `--resume`.
- **It prints a running total** after every sheet, and the cost of each Tavola as it finishes.
- **It writes `cost.json`**: the cost of every Tavola, sheet and Reading, the total beside the
  estimate and the limit, the model, and the price list it used with the date that was checked.
  That is what the Club is shown. A run carried on with `--resume` writes `cost-2.json`,
  `cost-3.json` and so on, each saying what that run spent.
- **On a subscription it is not charged**, and it says so before it starts, beside each Tavola and
  at the end. Its figures are what the same run would have cost at the price list, and the limit
  is held to those same figures, so a run behaves alike whichever credential pays. `cost.json`
  says `"charged": false`.

The cost is the token counts each response reports, multiplied by the price list in
`apps/api/src/reading/price-list.ts`. Nothing asks the provider's billing, so nothing needs an
admin credential. When the prices change, check them at the source the list names, and move its
date.

What it decides, and where it decides it:

- **A sheet belongs to the Tavola printed on it**, not the page it follows. A page whose Tavola
  number cannot be read is set aside in `set-aside.csv` and `set-aside/`, for a person to look at.
- **Each sheet is turned upright the way its headings read.**
- **Every Table sheet is read twice**, independently. A row is in doubt only where the two
  Readings differ on its Position, Catalog Number or quantity, or where a Catalog Number is not
  shaped like one. Where one Reading hesitated and the other read the same, that is a note.
- **The Italian is put into English** once a Tavola's sheets are read: its title, every
  *Denominazione* and every Note. The Italian is kept verbatim, and the English beside it is a
  **Machine translation** until an Editor confirms or rewrites it in Ricambi. Publishing the Tavola
  does not remove the label. The term list in `apps/api/src/reading/translation.ts` keeps one
  Italian word one English word, and within a directory the same Italian is translated once and
  reused, even across `--resume`. Every code and number is taken out before the Italian is sent,
  and an English that does not carry each one back unchanged is dropped, so that text is left
  without English.
- **A dash** for a position is the Position above: an undrawn Part on the catalogue layout, a drawn
  Part of the other hand on the Ufficio Tecnico layout. **A range** (`16-17`) is the Part at each
  Position. **Different numbers under the Dal–Al columns** are separate Parts, each with the
  column heading as its Fitment qualifier.

## What it writes

```
catalog-reading/
  reading.json          the Model, the Reading method, the Tavole
  pages.json            what each page was found to be, for --resume
  cost.json             what the run cost, per Tavola, sheet and Reading, beside its estimate
  cost-2.json …         the same, for each run carried on with --resume
  set-aside.csv         pages not in any Tavola, and why
  tavola-84/
    tavola.json         number, the title in Italian and English, the factory's header, the
                        sheets, and what the machine translated
    scan.png            the drawing
    table-1.png …       the Table sheets
    listings.csv        one row per Listing
```

`listings.csv` opens in Excel. An Editor may correct it there: change a Catalog Number, a
quantity, `Drawn`, an English name, or add and remove rows. Then save it as CSV. The `Doubt` and
`Reading note` columns are there to read, and the loader ignores them. An English name or title
still as the machine wrote it loads as a Machine translation. One an Editor changed, in
`listings.csv` or as `titleEn` in `tavola.json`, loads as theirs. The English of a Catalog Note is
always shown as a Machine translation. Where a Tavola has no English title, it carries its Italian
title in both places, and the load report says so.

## Loading

```sh
pnpm archive:load -- --source ../catalog-reading --dry-run   # writes nothing
pnpm archive:load -- --source ../catalog-reading
```

- Every Tavola arrives Unchecked, with its Scan, Table sheets, Listings and Catalog Notes, and the
  Reading method that read it.
- **An Unchecked Tavola already there is discarded and loaded again whole**, together with every
  Part that appears nowhere else. Read again, correct the CSV, and load again as often as needed.
- **A Published Tavola is refused.** It has been checked, and it is corrected in Ricambi.
