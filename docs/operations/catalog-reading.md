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
- An Anthropic API key in `ANTHROPIC_API_KEY`. It is billed per use. It is read from the
  environment, and it is never written to the output or printed.

## Reading

```sh
pnpm catalog:read -- --pdf ../catalog.pdf --out ../catalog-reading \
  --brand Iso --model Rivolta --pages 5-120
```

`--pages` leaves out the front matter and the technical data, so they are never sent to the
model. The command prints each Tavola as it reads it, the Table sheets it found and how many rows
are in doubt. It ends with the tokens it used.

What it decides, and where it decides it:

- **A sheet belongs to the Tavola printed on it**, not the page it follows. A page whose Tavola
  number cannot be read is set aside in `set-aside.csv` and `set-aside/`, for a person to look at.
- **Each sheet is turned upright the way its headings read.**
- **Every Table sheet is read twice**, independently. A row is in doubt only where the two
  Readings differ on its Position, Catalog Number or quantity, or where a Catalog Number is not
  shaped like one. Where one Reading hesitated and the other read the same, that is a note.
- **A dash** for a position is the Position above: an undrawn Part on the catalogue layout, a drawn
  Part of the other hand on the Ufficio Tecnico layout. **A range** (`16-17`) is the Part at each
  Position. **Different numbers under the Dal–Al columns** are separate Parts, each with the
  column heading as its Fitment qualifier.

## What it writes

```
catalog-reading/
  reading.json          the Model, the Reading method, the Tavole
  set-aside.csv         pages not in any Tavola, and why
  tavola-84/
    tavola.json         number, Italian title, the factory's header, the sheets
    scan.png            the drawing
    table-1.png …       the Table sheets
    listings.csv        one row per Listing
```

`listings.csv` opens in Excel. An Editor may correct it there: change a Catalog Number, a
quantity, `Drawn`, or add and remove rows. Then save it as CSV. The `Doubt` and `Reading note`
columns are there to read, and the loader ignores them. The English title in `tavola.json` is
left empty, because English names are a Machine translation of their own. Where it stays empty,
the Tavola carries its Italian title in both places, and the load report says so.

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
