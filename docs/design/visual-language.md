# Ricambi — visual language

The written statement of the direction, so later tickets inherit it rather than reinterpret it
from scratch. The tokens that implement it live in `apps/web/src/styles/tokens.css`; this file
is the reasoning, that file is the source of truth.

## The direction

**The Club's own identity, rendered with Apple's restraint and Google's plainness.**

- **From Apple**: the drawing is the hero and the interface recedes around it. Generous
  whitespace, large confident type, a restrained palette with very few accents, chrome that
  stays out of the artwork's way.
- **From Google**: the tools are plain and unambiguous. One dominant action per screen,
  high-contrast legible type, dense information presented calmly, no decoration on anything
  functional.

The synthesis, in one line: **the archive is a workshop instrument.** Not a product with a
personality — a tool that is precise, quiet and readable, wrapped around a 60-year-old drawing.

## The rules

**Numbers are identifiers, and they are always monospace.** Catalog Number, Disegno Origine,
Tavola number, Position number, quantities, prices, dates. These get compared character by
character against a number stamped on a bracket someone is holding, so they are set in IBM Plex
Mono with tabular figures and a slashed zero, never in the proportional face. The `.tabular`
class is the whole mechanism.

**Depth comes from value, not from blur.** Hairline rules and a step in surface lightness, not
drop shadows. A shadow implies a floating card; this is a printed index.

**One accent, and it is spoken for.** A deep Italian red. Nothing decorative is red — if red
appears, it either does something, points at something, or is the mark of the organisation.
That is the whole list of sanctioned uses:

1. the single dominant action on a screen;
2. Marks on a drawing;
3. a failure the member needs to notice;
4. the wordmark, which is identity rather than decoration — and which the Club's own colour
   will replace once it has been captured.

The accent exists as a fill and an ink because one red cannot both carry white text and be read
as text itself: `accent` is a fill (with `accent-hover` and `accent-contrast` alongside it),
`accent-ink` is the same red made legible on a surface.

**Dark by default; light is the paper theme.** A scan is black lines on white paper, so
graphite chrome makes the drawing the brightest thing on screen — and it is what a phone in a
dim garage wants. A stated system preference for light wins over that default; an explicit
choice wins over both, and is remembered.

**Built for a garage.** This is the actual usage context, not an accessibility afterthought.
Nothing interactive is under 44px in either dimension. Body text clears 4.5:1 against its
surface and non-text marks clear 3:1, including the faintest tokens. The focus ring is 3px of
amber in both themes — amber, not red, so "focused" never reads as "this is the action".

**The one ornament is a registration mark.** The corner ticks a printer aligns a plate with.
It appears on the wordmark and on empty states, and nowhere else. Everything in this archive
was printed once; that is the only reference the interface makes to it.

**English throughout.** The Club website is German. Neither borrows the other's language.

## Type

| Role | Face | Why |
| --- | --- | --- |
| Everything | Archivo Variable | A grotesque with a tall x-height and no ornament. Legible at arm's length on a phone, confident enough to carry a page with almost nothing else on it. |
| Every factory number | IBM Plex Mono | Tabular figures and a slashed zero, so two catalog numbers can be told apart by eye. |

Both are self-hosted, weight axis and Latin subsets only. No request ever leaves for a font, so
no consent is owed for one — the same rule the club website is being rebuilt to satisfy.

## Tokens

Defined once in `apps/web/src/styles/tokens.css`, consumed everywhere as semantic names —
`bg-surface`, `text-muted`, `border-line`, `h-control`. **A colour, spacing, radius or type
value written inline in feature code is a bug in the token file, not a shortcut.**

The layers are: raw values in `:root` and `.dark` → semantic names in `@theme inline` →
utility classes in components. Feature code only ever sees the third layer.

## Still provisional

**The Club's colour, typography and logo have not been captured yet.** The ticket calls for
them to be lifted from the live Club site so the two properties read as one organisation, and
the site is to be retired (club-website ticket 04 archives it first). Until that capture
happens:

- the accent red is a heritage Italian red chosen for the marque, not sampled from the Club;
- the wordmark is typographic and stands in for the real one.

Both are deliberately isolated — the accent is four token values per theme, the wordmark is one
component — so replacing them is a contained change and touches no feature code.
