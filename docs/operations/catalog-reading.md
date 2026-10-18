# Reading the factory catalog

The factory catalog exists only as scanned sheets. An Administrator reads it inside Ricambi, in
the **Readings** section. Each Tavola it reads arrives in the archive **Unchecked**. Only Editors
see it until one of them compares it with its sheets, corrects it and publishes it. Every
correction is made in Ricambi. The decisions and their reasons are in
[ADR 0017](../adr/0017-the-catalog-is-read-by-machine-and-published-by-an-editor.md) and
[ADR 0018](../adr/0018-the-catalog-is-read-inside-ricambi.md).

## What the server needs

The server reads with the one **Reading method** its configuration names in `READING_METHOD`:

- **`subscription`**: Claude Code in the server image, signed in with the token
  `claude setup-token` prints, given as the secret `CLAUDE_CODE_OAUTH_TOKEN`. It is not charged,
  and it draws on the plan's usage limits. Reading starts here while the Club has no API key.
- **`api-key`**: the Club's Anthropic API key, given as the secret `ANTHROPIC_API_KEY`. It is
  billed per use.
- **`fake`**: invents what it reads, for the practice environment and the tests. A production
  server refuses to start with it.

Give exactly one credential. With no method, a missing credential, or both credentials, nothing
can be read, and the Readings section says which and why. A key that happens to be set never
pays for a subscription's reading: it is taken out of Claude Code's environment, and a reading
Claude Code still reports making with a key is refused.

The Readings section says what the server reads with, and whether that is charged. It never shows
a credential, or whose subscription it is.

The catalog upload may be up to `MAX_CATALOG_BYTES`, 500 MB unless it is set otherwise.

## Reading a catalog

In **Readings**, under **Read a catalog**:

1. Choose the catalog PDF and the Model it is for.
2. Give the first and the last page to read. Leave out the front matter and the technical data,
   so they are never sent to the model. Both pages are required.
3. Press **Estimate the cost**. Nothing is read yet. Ricambi shows what reading those pages would
   cost, whether that is charged, and the prices it used.
4. Give a **spending limit** in dollars, and press **Start reading**. There is no default. A limit
   below the estimate is refused.

The run then reads on the server, and its page shows it as it goes:

- its state;
- what it has spent against its limit;
- each Tavola it has found, with what it cost.

Each Tavola is in the archive, Unchecked, as soon as it is read, and its line on the run page
opens it. The page can be closed: the run carries on. Only one Catalog run reads at a time.

A Tavola already Published is not replaced. Its line says so, and the run reads on.

## When a run stops

A run stops cleanly, and keeps every Tavola it has finished:

- before the next request could pass its spending limit;
- at the subscription's usage limit;
- when the model fails or declines to answer, rather than asking again at the Club's expense
  (what it said is in the server's log, not on the page);
- when an Administrator presses **Stop reading**.

**Continue reading** carries it on from where it stopped. Where the limit stopped it, give a
higher limit first. What it has already spent counts against the new limit. A continued run does
not ask again about a page it has placed, and does not read a finished Tavola again. A Tavola it
stopped in the middle of is read again whole.

Every deployment restarts the server. A run left reading is carried on by the next server from
its last finished step, and its page says the server continued it.

## Pages set aside

A page whose Tavola number cannot be read is never guessed. The run page lists it under **Set
aside**, with why, and **Open the page** shows it. Like the catalog, it is shown to
Administrators only. A continued run does not ask about it again.

## What it costs

- **The whole run is estimated before anything is sent.** Every page is counted as whichever
  would cost more:
  - a Table sheet: asked what it is, read twice and translated;
  - a drawing: asked what it is, and its numbers read 40 to a request.

  A catalog with drawings in it therefore costs less than its estimate. An answer cannot be
  counted before it is written, so each is allowed what it is expected to take: 1,000 tokens to
  say what a page is, 8,000 to read a Table sheet, 2,000 to translate one, 2,000 for each request
  for numbers. With an API key, the questions are counted with the provider's free
  token-counting endpoint, exactly as they would be sent. A subscription cannot use that
  endpoint, so its questions are worked out from above, every image at full size and twice over.
- **It never passes the limit.** Before each request, the most it could cost is set against what
  is left of the limit, and the run stops first if it could pass it. So give the limit some room
  above the estimate.
- **On a subscription it is not charged.** Its figures are what the same run would have cost at
  list prices, and its limit is held to those same figures, so a run behaves alike whichever
  credential pays.

**Every run is recorded.** Readings lists past runs, the latest first, each with its date, Model,
state, total and Reading method. Each opens its run page. The run's **Record** shows:

- its total beside its estimate and its limit;
- the model and the price list, with the date the prices were checked;
- every Tavola, page by page: asking what the page is, each Reading, the drawing's numbers read
  into Marks, and the translation;
- the pages set aside, and what asking about them cost.

A continued run has a record for each time it read. **Who did what** lists who started, raised,
continued or stopped it, and when. Runs, their costs and their Reading method are shown to
Administrators only.

The cost is the token counts each response reports, multiplied by the price list in
`apps/api/src/reading/price-list.ts`. Nothing asks the provider's billing, so nothing needs an
admin credential. When the prices change, a developer checks them at the source the list names,
and moves its date.

## What the reading decides

- **A sheet belongs to the Tavola printed on it**, not the page it follows. A page whose Tavola
  number cannot be read is set aside.
- **Each sheet is turned upright** the way its headings read.
- **Every Table sheet is read twice**, independently. A row is in doubt only where the two
  Readings differ on its Position, Catalog Number or quantity, or where a Catalog Number is not
  shaped like one. Where one Reading hesitated and the other read the same, that is a Reading
  note, not a doubt.
- **The Italian is put into English** once a Tavola's sheets are read: its title, every
  *Denominazione* and every Note. The Italian is kept verbatim. The English beside it is a
  **Machine translation** until an Editor confirms or rewrites it, and publishing does not remove
  the label. The term list in `apps/api/src/reading/translation.ts` keeps one Italian word one
  English word. Every code and number is taken out before the Italian is sent, and an English
  that does not carry each one back unchanged is dropped.
- **A Mark is proposed for every position number found on the drawing.** Where a number is comes
  from the ink alone. The model is shown each one as a small crop and says what number it is, or
  that it is none. It is never asked where anything is. Nothing near the sheet's edge, or inside
  a title block's cells, is sent or marked. A number printed sideways is not found, and shows up
  as a Position with no Mark.
- **Where the drawing and the table disagree, it is in doubt**: every Position the table lists
  with no Mark, and every Mark whose number no row lists.
- **A dash** for a position is the Position above. **A range** (`16-17`) is the Part at each
  Position. **Different numbers under the Dal–Al columns** are separate Parts, each with the
  column heading as its Fitment qualifier.

## Checking and publishing

An Editor opens an Unchecked Tavola as any other. A Model's page lists its Tavole **Left to
check**. While a Tavola is Unchecked, its page also shows:

- in the Unchecked band, the Reading method that read it, and every doubt. A doubt leads to the
  row it is about. Once looked at, it can be rewritten or cleared;
- each Table sheet beside the rows read from it. Any row can be corrected there, or flipped
  between drawn and not drawn;
- a row's Reading note, as a quiet line under it.

Marks are corrected with the marking tool, and a Part with its usual panel. A Scan read on its
side is turned a quarter at a time, and its Marks turn with it. English names are confirmed or
rewritten where they are shown.

**Publish** is allowed while doubts remain. Once the Tavola is Published, Members can open it and
its Table sheets, but are never told which Reading method read it.

### Reading one Tavola again

Where a Tavola was read badly, an Administrator can press **Read again** under its Unchecked band
instead of reading the catalog again. Its own run is estimated, from only the pages it was found
on, and started with its own limit like any other. When the run finishes, the Tavola is replaced
whole. Reading again is refused, with the reason:

- for a Published Tavola, which is corrected in Ricambi instead;
- for one with Contributions on its Positions;
- while another run is reading.

## The read command, for developers

The reading also runs from the command line. It is for developing and testing the reading
itself, and is not how the Club reads its catalog.

```sh
pnpm catalog:read -- --pdf ../catalog.pdf --out ../catalog-reading \
  --brand Iso --model Rivolta --pages 5-120 --limit 20
pnpm archive:load -- --source ../catalog-reading --dry-run
```

- It writes a directory of plain files, which it refuses to put inside this repository: what each
  page was found to be, `cost.json`, the set-aside pages, and a directory for each Tavola.
- It reads with Claude Code signed in on the machine, or with `ANTHROPIC_API_KEY`. `--with
  subscription` or `--with api-key` chooses between them where both are there.
- It needs Poppler's `pdftoppm` (`poppler-utils` on Debian and Ubuntu, `poppler` in Homebrew).
- `--resume` carries a stopped run on in the same directory.
- `archive:load` loads the directory as Unchecked Tavole, by the same rules a Catalog run loads
  by. `--dry-run` writes nothing.
