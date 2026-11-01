# Ricambi — visual language

The written statement of the direction, so later tickets inherit it rather than reinterpret it
from scratch. The tokens that implement it live in `apps/web/src/styles/tokens.css`; this file
is the reasoning, that file is the source of truth.

## Changing: the Club website's identity (ADR 0020)

Decided on 2026-11-01 (#201), and **not built yet**: until it is, the rest of this document
describes what is in the code. When it is built, this document is rewritten to match:

- **Teal `#2ba0a3`, the Club website's, is the one accent**, for what is pressed and for links,
  darkened along its hue where it carries text on white. Champagne and ice blue go.
- **Marks on a drawing keep a colour of their own**, chosen for the paper of a scan.
- **Light by default**: a white page in the graphite header and footer (`#24272d`). Dark stays.
- **Headings in Raleway 500.** Open Sans and IBM Plex Mono stay; Barlow Condensed goes.
- **The Club's wordmark in the header**, and the Club's emblem on the large icons. The logo files
  are committed with the build: the Club's identity is no longer kept out of the repository.
- **Measured from the live site's stylesheets** (WordPress, Avada theme), not a browser capture
  this time; the prototype is compared with the site side by side before anything is built.

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

**The one thing that floats is the card a Mark shows on a pointer** (issue #35), and it is the
only shadow in the archive (`--shadow-card`), because it alone lies over the artwork. It stands
beside the circle on whichever side has room, heads itself with the number on the Mark's own blue
chip, and holds nothing that can be pressed: everything it says, a click also shows. Its type
scales with the screen (`--text-card`) and never goes below the body size, and its width
(`--width-card`) makes it a reading card on a small laptop rather than a thumbnail in a corner.

**One accent pair, and it is Ricambi's own** (ADR 0014). Two colours with two jobs, and nothing
decorative wears either:

- **Champagne is what is pressed.** The fill of the single dominant action on a screen, and
  nothing else.
- **Ice blue is what points.** Marks on a drawing, **and the Position one belongs to wherever
  else that Position appears** — the circle on the sheet and its number in the list below are one
  thing being pointed at, and colouring them differently would leave a member to work out that
  they are the same. Links are the same colour for the same reason: each is the interface
  pointing at something. Wherever a Position being read is named off the sheet, it is a chip in
  the Mark's own deep blue, so the list and the drawing show one colour rather than two blues.

**A failure is red, and red is nothing else.** `alarm` is text only — never a fill, never
decoration, never an action — so the one red thing on a screen is the thing that went wrong.

The wordmark wears neither: it is set in the text colour, because identity here is the lettering
and the roundel rather than a hue.

Each exists at two depths of one hue. On graphite `accent` is the pale champagne with graphite
ink on it at 9.5:1 and `accent-ink` is pale ice blue at 10:1; on paper, where a pale fill would
vanish, both come from the deep end — a bronze fill carrying white at 5.8:1 and a blue that
clears 6:1 on every light surface. A Mark is not themed at all: it only ever sits on paper, so
it is always the deep blue (4.8:1), and a chip naming the Position being read is that same blue
with paper white on it, at the same ratio.

**Dark by default; light is the paper theme.** A scan is black lines on white paper, so
graphite chrome makes the drawing the brightest thing on screen — and it is what a phone in a
dim garage wants. The Club's own site agrees: its chrome is a cool graphite and its hero is
near-black, so this was a hypothesis worth testing and the measurement settled it.
`surface-raised` is the Club's chrome value exactly; the archive's own header sits on the page
surface a step below it, ruled off by a hairline, so the chrome is the thinnest thing on the
screen. A stated system preference for light
wins over the default; an explicit choice wins over both, and is remembered.

**One value is deliberately under the bar, and it is a state the member switched on.** When a
member asks to see a Sub-assembly on a drawing, the circles that are *not* in it recede to
`--mark-receded` — the Mark's blue at 30%, which measures 1.5:1 on paper and clears nothing. That is
the point: it is the navigator's scrim applied to circles instead of to the sheet, so "the bright
ones are the ones you asked for" needs no legend. Nothing is taken away — every receded circle is
still there, still hittable at its full 44px, and one press on the same control brings the sheet
back. A mark that a member has not asked to have receded never wears it.

**Built for a garage.** This is the actual usage context, not an accessibility afterthought.
Nothing interactive is under 44px in either dimension — `--spacing-control`, and the one place
that figure is also written as a number is `MARK_TOUCH` in the drawing viewer, which has to do
the arithmetic in the drawing's own pixels and cannot read a token to do it. Body text clears 4.5:1 against its
surface and non-text marks clear 3:1, including the faintest tokens. The focus ring is 3px of
ink — the text colour, white on graphite and graphite on paper — so it is the strongest contrast
the surface has and can never read as either accent. A Mark is focused on paper in both themes
and always takes the graphite ring.

**Labels are sentences, not stamps.** Whatever names the thing under it — a section, a field, a
column — is the `.label` class: small, weighted, in the sentence's own case. A word of standing
beside something else ("Not drawn", "2 places", a role) is `.tag`. Nothing in the interface is
set in small capitals except the proof stamp, which is meant to look stamped.

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
"not the real thing" — and it is orange where a failure is red, and a band rather than a
line of text, so it reads as a caution label and not as something that went wrong.

**And nothing else changes.** A practice system wears production's surfaces and rules exactly,
in both themes, because it is what the Club judges Ricambi by and it has to look like the Club's
own. The band travels with the sticky chrome, so it is at the top of every page however far the
page is scrolled. A drawing filling the screen covers the chrome, so it carries the same stamp
cut down to one word, `DEMO`, in the corner nothing else uses; it lets every pointer through to
the sheet. Production shows neither.

## Type

Two faces and the numbers.

| Role | Face | Why |
| --- | --- | --- |
| Display and the wordmark | Barlow Condensed | The nearest open face to the tall, light, condensed capital the Club sets its own lockup in. Light, uppercase and only at size, through the `.display` class: a car's name, a front door. Never for anything read in a sentence. |
| Headings, body and interface | Open Sans Variable | The Club's own body face. Humanist, tall x-height, unfussy at small sizes and at arm's length. |
| Every factory number | IBM Plex Mono | **Ours, and additive.** Tabular figures and a slashed zero, so two catalog numbers can be told apart by eye. The Club site has no numbers to compare and therefore no opinion. |

**Two type steps, and the garage keeps its own.** Below the breakpoint at which a drawing sits
beside its parts (64rem) every size is what a phone at arm's length needs. From it up, a laptop
reads a step denser (`--type-*` in the tokens), so the archive shows more at once on a desk. Only
type moves: controls, touch targets and contrast are the same at every width, and nothing read as
a sentence goes below 14px.

All three are self-hosted, Latin subsets only. No request ever leaves for a
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
whatever is left in a decade-old stylesheet: its chrome, its rule colour, its heading ink and
its body grey. Those sRGB values were converted to OKLCH and are the surface, rule and text
tokens. The Club's one accent, a teal, was measured too and is no longer used (ADR 0014).

**Only lightness was changed, and only where contrast demanded it.** The body grey could not
carry text at 4.5:1 as this archive's `muted`, and was moved along its own lightness axis until
it cleared the bar and no further. Hue and chroma of everything measured are the Club's.

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
the Club's graphite or its body face, these tokens are the one place that has to follow — and the
capture is worth re-running against whatever replaces it, so the two properties do not drift
apart the moment the new site ships.
