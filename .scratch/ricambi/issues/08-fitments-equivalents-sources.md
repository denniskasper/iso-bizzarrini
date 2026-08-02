# 08 — Fitments, Equivalents and Sources

**What to build:** The content that turns a catalog into something useful to a restorer: which
cars the Part fits, what you can buy instead of it, and where it has actually been available.

Cross-references from unobtainable original to purchasable modern equivalent are the single most
valuable content the archive will hold.

**Blocked by:** 06 — Parts, Listings, and reading a part from a circle.

**Status:** ready-for-agent

- [ ] A Fitment records that a Part fits a Model, with an **optional free-text qualifier** — "1963–64", "from chassis #310", "late"
- [ ] Qualifiers are never forced into structured fields; half-known chassis breaks must be recordable as the contributor knows them
- [ ] A Part lists every Model it fits, with each qualification, so the member judges compatibility themselves
- [ ] Equivalents are an **unbounded list**, never fixed slots — nothing is lost because there were only two columns
- [ ] Each Equivalent carries a kind: OE Supplier, OEM, Industry Standard, or **Donor Vehicle**
- [ ] Donor Vehicle equivalents may have no reference number, because often nobody knows it — the car alone is the useful fact
- [ ] Sources are an unbounded list with name, URL, optional price, currency, observed date and note
- [ ] **A price can never be rendered without its observed date** — enforced by the model, not by whoever builds the page. Entering a price without a date is refused at the point of entry, not merely hidden at display
- [ ] Currency is a fixed set covering where these cars actually trade — at minimum EUR, USD, GBP, CHF
- [ ] A Source records the **condition** of what is offered: new old stock, used, or reproduction. A restorer's decision changes completely depending on which, and it is the first thing they ask
- [ ] All three are editable by an Editor
- [ ] UI and design work uses the `/frontend-design` skill
