# A Tavola belongs to exactly one Model; reuse lives at the Part level

Tavola numbers restart in each factory catalog booklet, so "Tav. 84" is only meaningful as
"Tav. 84 of this Model's catalog". Scoping a Tavola to one Model keeps that unambiguous.
Where the factory reprinted the same exploded view for several cars, we store it once per
Model rather than sharing it, and accept that its Marks are placed more than once.

Sharing at the Tavola level would fight the numbering to buy something we already have one
level down: the same **Part** appears in **Listings** on many Tavole. That is where reuse
belongs, and it is what makes "which other drawings does this Part appear on" answerable.

## Considered Options

A **Catalog** layer between Model and Tavola — handling revised editions and booklets
covering several cars — was rejected as a level of navigation nobody says the word for.
The factory's own classification (*Sezione* / *Gruppo* / *Sottogruppo*) is recorded verbatim
on each Tavola as provenance, so it can become navigation later if it proves consistent
across catalogs. A flat **Category** per Tavola serves cross-Model grouping in the meantime.
