# 08 — Fitments, Equivalents and Sources

**What to build:** The content that turns a catalog into something useful to a restorer: which
cars the Part fits, what you can buy instead of it, and where it has actually been available.

Cross-references from unobtainable original to purchasable modern equivalent are the single most
valuable content the archive will hold.

**Blocked by:** 06 — Parts, Listings, and reading a part from a circle.

**Status:** done

- [x] A Fitment records that a Part fits a Model, with an **optional free-text qualifier** — "1963–64", "from chassis #310", "late"
- [x] Qualifiers are never forced into structured fields; half-known chassis breaks must be recordable as the contributor knows them
- [x] A Part lists every Model it fits, with each qualification, so the member judges compatibility themselves
- [x] Equivalents are an **unbounded list**, never fixed slots — nothing is lost because there were only two columns
- [x] Each Equivalent carries a kind: OE Supplier, OEM, Industry Standard, or **Donor Vehicle**
- [x] Donor Vehicle equivalents may have no reference number, because often nobody knows it — the car alone is the useful fact
- [x] Sources are an unbounded list with name, URL, optional price, currency, observed date and note
- [x] **A price can never be rendered without its observed date** — enforced by the model, not by whoever builds the page. Entering a price without a date is refused at the point of entry, not merely hidden at display
- [x] Currency is a fixed set covering where these cars actually trade — at minimum EUR, USD, GBP, CHF
- [x] A Source records the **condition** of what is offered: new old stock, used, or reproduction. A restorer's decision changes completely depending on which, and it is the first thing they ask
- [x] All three are editable by an Editor
- [x] UI and design work uses the `/frontend-design` skill

## How each was met

**The price and its date are one fact, in three places that cannot disagree.** A check constraint
in `schema.ts` (`sources_price_carries_its_date`) refuses the row; `ObservedPrice` in
`packages/contracts` makes a dateless price unrepresentable on the wire; and the service refuses
the request. A screen cannot print one without the other because there is no such thing to reach
for. Covered at both seams — *"is refused when a price arrives without the date it was seen"*,
*"is refused when a correction takes the date off a price"*, and in the browser *"a price typed
without its date is refused, and then accepted with one"*.

**A Donor Vehicle with no reference is ordinary, and recorded twice is not.** `reference` is
nullable, so the car alone is a complete answer. Because Postgres counts two NULLs as different,
the unique constraint over `(part, kind, maker, reference)` cannot see a repeat where there is no
reference — so there is a second partial unique index for exactly that case. Otherwise one donor
vehicle entered twice would print twice with nothing to tell the two apart.

**The four kinds and the four currencies are each written once.** `EQUIVALENT_KINDS`,
`SOURCE_CONDITIONS` and `CURRENCIES` in `schema.ts` are the same literals the check constraints are
built from and the same list the request validation uses, so a fifth kind cannot be accepted by one
and refused by the other.

**Ordering belongs to the archive, not to the browser.** Writing any of the three answers with the
whole Part re-read (`PartRecordResponse`), because each list has a rule — the cars in the catalog's
own order, the equivalents from the original supplier outwards to the scrapyard, the sources with
the most recently seen price first — and a browser handed the one row that changed would have to
re-derive three orderings in a second place free to disagree.

Thirty-nine tests: 33 at the API seam (`apps/api/tests/part-record.test.ts`) and 6 in the browser
(`apps/web/e2e/part-record.spec.ts`). The practice archive now seeds all three, so a preview has
something to read.
