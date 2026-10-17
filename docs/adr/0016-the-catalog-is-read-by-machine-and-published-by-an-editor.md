# The factory catalog is read by machine, and published by an Editor

The catalog exists only as scanned sheets: a few dozen Tavole per Model, each a drawing with up
to a hundred position numbers and one to eight sheets of typed table. Keying that in by hand is
the long pole of the whole archive, so a command reads the scans and proposes each Tavola's
Listings, English names and Marks — and nothing it proposes is shown to a Member until an Editor
has compared it with the sheet and published it.

This qualifies ADR 0005 rather than reversing it. That decision refuses bulk loading because it
overwrites curated work; an **Unchecked** Tavola has none, so it may be thrown away and read again
as often as the reading improves. A **Published** Tavola is never reloaded. It does reverse the
earlier position that Marks are human work.

## How it reads, and why that way

**Geometry says where a number is; the model says what it reads.** Position numbers are found as
number-shaped ink in the scan and handed to a vision model one crop at a time. A model asked for
coordinates on a dense drawing is approximate; a Mark has to sit on its number.

**Every table sheet is read twice, independently.** Where the two readings differ on a Position,
a Catalog Number or a quantity, the row is put in front of the Editor as a doubt. Agreement is
not proof — two Readings can share a misread — which is why publishing remains a person's act.

**A sheet belongs to the Tavola printed on it, not to the page it follows.** The scans are out of
order, and a sheet whose number cannot be read is set aside for a person rather than guessed.

**It is a command, not a screen.** It needs a paid model, minutes per sheet and files a person may
want to correct between reading and loading; none of that belongs in a members' web application.

**It reaches the model through a paid API key, and says what it spends.** Plain code, repeatable
and unattended, which an operator-driven chat session is not. Before it reads anything it estimates
the whole run from the pages it will send, and it refuses to start above the spending limit it is
given — there is no default, so nobody spends by accident. While it reads it shows a running
total, and it stops cleanly at the limit, keeping the Tavole already finished. Each run writes a
cost record per Tavola, sheet and Reading, computed from the token counts the API returns at a
price list kept in the repository with the date it was checked. That record is what the Club is
shown; it needs no login to the model provider, and no second, more powerful credential to fetch
the provider's own billing.

**What it writes can be corrected in a spreadsheet before it is loaded.** The rows are written in a
form Excel opens. An Editor may correct them there and load the result, because an Unchecked
Tavola holds nothing that reloading could lose. Once published, a Tavola is corrected in Ricambi
and only exported as a spreadsheet, as ADR 0005 says.

**The scan is turned upright the way its headings read.** Position numbers on these sheets run in
several directions and cannot decide it. The Editor can turn a Scan a quarter at a time; Marks are
fractions of the sheet, so they turn with it.

## What the trial measured

Three Tavole of the Rivolta — one clean, one dense with two table sheets, one very dense with
eight — at the 200 dpi the Club's scans were made at. The two Readings agreed on all 171 Catalog
Numbers and on all but one quantity. 183 of 195 listed Positions received a Mark, 94%, and 89% on
the densest sheet; the misses were numbers printed faintly or touching a leader line. Supplier
codes in the *Note* column were the weak spot and are kept from one reading without raising a
doubt. Classical OCR was tried first and read almost nothing.

Nobody compared every row with the sheets, so these are agreement figures, not accuracy figures.

## Considered Options

**Editors key everything in, with bulk-paste as the concession.** What ADR 0005 left us with, and
still how anything is corrected. Rejected as the way to *start*: several thousand rows and Marks
before a Member sees a single drawing.

**Show machine output straight away, marked as unverified.** Rejected: a wrong Catalog Number
looks exactly like a right one, and people order parts by it.

**A state on every row and every Mark.** Rejected for one state on the Tavola. Checking is done a
sheet at a time, and a Tavola half-visible to Members is harder to reason about than one that is
not there yet.

**Free software on our own machine, chosen when no API key is available.** Classical OCR read
almost nothing. A local vision model has not been tried; it gets a short trial on the same three
Tavole, and only if it agrees with the paid readings on at least 95% of Catalog Numbers, and can
read Tavola 84 at all, does the command learn a second Reading method.
