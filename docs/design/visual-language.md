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

**One accent, and it is the Club's.** A teal, measured from the Club site, where it is the one
colour on an otherwise monochrome page and marks links. Nothing decorative wears it — if the
accent appears, it either does something, points at something, or is the mark of the
organisation. That is the whole list of sanctioned uses:

1. the single dominant action on a screen;
2. Marks on a drawing, **and the Position one belongs to wherever else that Position appears** —
   the circle on the sheet and its number in the list below are one thing being pointed at, and
   colouring them differently would leave a member to work out that they are the same;
3. a failure the member needs to notice;
4. the wordmark, which is identity rather than decoration.

The accent exists as a fill and an ink because the measured teal carries white text at only
3.15:1: `accent` is that teal darkened until white sits on it at 4.5:1 (with `accent-hover` and
`accent-contrast` alongside it), `accent-ink` is the same teal made legible as text on a
surface. Hover deepens the chroma rather than the lightness, so the contrast the fill was
chosen for survives the interaction.

**Dark by default; light is the paper theme.** A scan is black lines on white paper, so
graphite chrome makes the drawing the brightest thing on screen — and it is what a phone in a
dim garage wants. The Club's own site agrees: its chrome is a cool graphite and its hero is
near-black, so this was a hypothesis worth testing and the measurement settled it.
`surface-raised` is the Club's chrome value exactly, which is why the band across the top of
the archive is the band across the top of the Club's site. A stated system preference for light
wins over the default; an explicit choice wins over both, and is remembered.

**Built for a garage.** This is the actual usage context, not an accessibility afterthought.
Nothing interactive is under 44px in either dimension — `--spacing-control`, and the one place
that figure is also written as a number is `MARK_TOUCH` in the drawing viewer, which has to do
the arithmetic in the drawing's own pixels and cannot read a token to do it. Body text clears 4.5:1 against its
surface and non-text marks clear 3:1, including the faintest tokens. The focus ring is 3px of
amber in both themes — amber, not the accent, so "focused" never reads as "this is the action".

**The one ornament is the Club's roundel.** A thin-ruled circle quartered by a diagonal cross —
the geometry of the Club's own emblem, which doubles as the registration mark a printer aligns a
plate with. It appears on the wordmark and on empty states, and nowhere else. Every drawing in
this archive was printed once; that is the only reference the interface makes to it.

**English throughout.** The Club website is German. Neither borrows the other's language.

**The one element that does not recede is the proof stamp.** A non-production system wears a
band across the top — orange, hatched along its bottom edge like the margin of a printer's proof
sheet, carrying `DEMO` and one plain sentence. Everything else in this interface gets out of the
drawing's way; this does not, because the failure it prevents is someone taking practice data
for the archive. It is the same orange in light and dark, because it is a mark printed *on* the
archive rather than part of it, and it must look identical in a screenshot however the reader's
phone is set. Its hue is one the Club uses nowhere — that is what makes it legible as
"not the real thing" — and it is far enough from the amber focus ring to be read as a caution
label rather than as a focused control.

**And the surfaces go warm with it.** In a non-production system `surface`, `surface-raised`,
`surface-sunken` and the rules take a warm cast, so no screenshot of any part of any screen can
pass for the archive. Production wears the Club's own cool graphite, or its white paper; a
practice system deliberately does not wear the Club's colour. **Hue and chroma carry the
difference; lightness is production's**, which is what keeps it safe: contrast is carried by
lightness, so every ratio measured for production holds here and no token had to be re-argued.
Two values in the light theme are forced exceptions — paper already sits at the top of the
lightness scale and white cannot be warm, so `surface` drops 0.007 and `surface-raised` 0.012,
the least that leaves them in gamut. Both were re-measured.

## Type

The Club's own two faces, so the archive and the Club site read as one organisation.

| Role | Face | Why |
| --- | --- | --- |
| Display, headings and the wordmark | Raleway Variable | The Club's own display face. It sets its lockup in it — uppercase, generously tracked, medium weight — which is the treatment this archive borrows. |
| Body and interface | Open Sans Variable | The Club's own body face. Humanist, tall x-height, unfussy at small sizes and at arm's length. |
| Every factory number | IBM Plex Mono | **Ours, and additive.** Tabular figures and a slashed zero, so two catalog numbers can be told apart by eye. The Club site has no numbers to compare and therefore no opinion. |

All three are self-hosted, weight axis and Latin subsets only. No request ever leaves for a
font, so no consent is owed for one — the same rule the club website is being rebuilt to
satisfy, and the reason its current cookie banner exists.

## Tokens

Defined once in `apps/web/src/styles/tokens.css`, consumed everywhere as semantic names —
`bg-surface`, `text-muted`, `border-line`, `h-control`. **A colour, spacing, radius or type
value written inline in feature code is a bug in the token file, not a shortcut.**

The layers are: raw values in `:root` and `.dark` → semantic names in `@theme inline` →
utility classes in components. Feature code only ever sees the third layer.

## Where the identity comes from

**It was measured, not invented.** The live Club site was loaded in a real browser and its
*computed* styles were read — every element's font, colour, background and border — then ranked
by how often each value actually appears. That gives the Club's real palette rather than
whatever is left in a decade-old stylesheet: its chrome, its rule colour, its heading ink, its
body grey and its one accent. Those sRGB values were converted to OKLCH and are the tokens.

**Only lightness was changed, and only where contrast demanded it.** Three measured values
could not carry text at 4.5:1 — the teal as a fill under white, the teal as text on paper, and
the body grey as this archive's `muted`. Each was moved along its own lightness axis until it
cleared the bar and no further. Hue and chroma are the Club's throughout.

A fourth was found later, doing the same arithmetic for the non-production surfaces: dark
`text-faint` cleared 4.5:1 against the page but reached only 4.20 against `surface-raised`,
which is where it is actually used — the status strip in the footer. It was lifted from 0.625 to
0.645. **Measure a token against the surface it sits on, not against the page.**

**What is deliberately not here: the Club's logo file.** It carries the association's name, and
this repository does not hold client-identifying assets (`AGENTS.md`, Security). The *treatment*
is what makes the two properties look alike, and that is all in `wordmark.tsx` and in these
tokens; the asset itself is dropped in at deploy time.

**Capture this again before the Club site is retired.** The measurement above is a snapshot of a
WordPress theme that is being replaced (club-website tickets 04 and 05). If the rebuild changes
the Club's palette or faces, these tokens are the one place that has to follow — and the
capture is worth re-running against whatever replaces it, so the two properties do not drift
apart the moment the new site ships.
