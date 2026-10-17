# Part identity is internal; the Catalog Number is unique when present

A Part is identified internally, not by any factory number, because a large part of the
archive arrives from spreadsheets with a description and no number at all — and if the
number were the identity, those Parts could not exist. The **Catalog Number** (the
catalog's *N° Ordinazione* column, e.g. `202110`) is optional but no two Parts may claim the same
one: entering a number that already exists shows the existing Part and forces a merge or a
correction. That collision is not an obstacle, it is the deduplication mechanism, and it is
the only thing keeping "which other Tavole does this Part appear on" honest. **Disegno
Origine** (e.g. `260 06 110`) is a second, prominently displayed attribute and is not required
to be unique.

## Considered Options

The original prototype constructed a 9-digit Product ID from category + position + sub-part
(`1200` + `042` + `00`). Rejected: it changes when a Part is re-positioned or
re-categorised, it cannot express a Part appearing on two Tavole, and it is a numbering
scheme the club would own forever in competition with the one the community already quotes.

No number is invented. Where a Part has no factory number, it has none, and the interface
says so rather than showing a placeholder.
