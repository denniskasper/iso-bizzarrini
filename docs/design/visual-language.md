# Ricambi — visual language

The written statement of the direction, so later tickets inherit it rather than reinterpret it
from scratch. The tokens that implement it live in `apps/web/src/styles/tokens.css`; this file
is the reasoning, that file is the source of truth.

## The direction

**The Club website's identity, rendered with Apple's restraint and Google's plainness**
(ADR 0020). Members should know at first sight that Ricambi is the Club's own, so it wears what
the Club website wears: its teal as the one accent, a white page in a graphite header and footer,
Raleway headings over Open Sans, and the Club's own wordmark in the header.

- **From Apple**: the drawing is the hero and the interface recedes around it. Generous
  whitespace, large confident type, a restrained palette with very few accents, chrome that
  stays out of the artwork's way.
- **From Google**: the tools are plain and unambiguous. One dominant action per screen,
  high-contrast legible type, dense information presented calmly, no decoration on anything
  functional.

**What stays Ricambi's is the layouts.** The website's page layouts and hero images are not
copied: a parts archive's screens are tools around a drawing.

The synthesis, in one line: **the archive is a workshop instrument.** Not a product with a
personality — a tool that is precise, quiet and readable, wrapped around a 60-year-old drawing,
and dressed in the Club's colours.

## The rules

**Numbers are identifiers, and they are always monospace.** Catalog Number, Disegno Origine,
Tavola number, Position number, quantities, prices, dates. These get compared character by
character against a number stamped on a bracket someone is holding, so they are set in IBM Plex
Mono with tabular figures and a slashed zero, never in the proportional face. The `.tabular`
class is the whole mechanism.

**Depth comes from value, not from blur.** Hairline rules and a step in surface lightness, not
drop shadows. A shadow implies a floating card; this is a printed index. On the white page a
raised surface is white too, told apart from the page by its rule, as the website does it.

**The one thing that floats is the card a Mark shows on a pointer** (issue #35), and it is the
only shadow in the archive (`--shadow-card`), because it alone lies over the artwork. It stands
beside the circle on whichever side has room, heads itself with the number on the Mark's own
ultramarine chip, and holds nothing that can be pressed: everything it says, a click also shows.
Its type scales with the screen (`--text-card`) and never goes below the body size, and its width
(`--width-card`) makes it a reading card on a small laptop rather than a thumbnail in a corner.

**Teal is the one accent, and it is the Club's** (ADR 0020). The website's `#2ba0a3`, for what
is pressed and for links, and nothing decorative wears it:

- **As a fill it is the website's teal exactly** (`accent`): the single dominant action on a
  screen. White on it would be 3.2:1, so what sits on it is the graphite ink (`accent-contrast`),
  at 4.8:1; the fill itself clears 3:1 on the white page. Hover lifts it, which only adds
  contrast to the ink (5.4:1). It is the same fill in both themes: 5.7:1 against the dark page
  and 4.8:1 against the graphite chrome.
- **As text it is darkened along its own hue** (`accent-ink`), keeping the website's hue and
  only moving lightness and chroma until it carries text: 5.8:1 on white and 5.2:1 on the sunken
  surface, the lowest it sits on. Two lighter shades were measured, at 0.52 and 0.53 lightness;
  they reached 4.7:1 and 4.5:1 sunken, which clears the bar with nothing to spare for a phone in
  poor light. In the dark theme and in the graphite chrome it is lifted along the same hue
  instead, to 7.2:1 on graphite and 8.7:1 on the dark page.

**A Mark keeps a colour of its own, and it is never the accent.** Teal says "press this"; a Mark
says "this is the thing on the drawing", and the two must not be confused. The Mark is an
**ultramarine** (`mark`, `oklch(0.5 0.2 266)`), chosen for the paper of a scan and for nothing
else: 6.3:1 on paper white and 4.6:1 on an aged, yellowed sheet, where the blue it replaced fell
to 3.5:1. It sits 68° of hue from the teal at twice its chroma. A violet stood out as well, but
sat 25° from Development's magenta band. **The Position a Mark belongs to wears it wherever else
that Position appears** — the circle on the sheet and its number in the list below are one thing
being pointed at — so a Position being read is named off the sheet as a chip in the Mark's
ultramarine with paper white on it (`mark-contrast`), at the same 6.3:1. A Mark is not themed: it
only ever sits on paper.

**A failure is red, and red is nothing else.** `alarm` is text only — never a fill at rest, never
decoration, and the colour of one kind of action only, the kind that cannot be undone — so the
one red thing on a screen is the thing that went wrong.

**Light by default; dark is one press away.** A white page framed by a graphite header and
footer, as on the Club website, whatever the device's own setting is. A member who presses the
theme button for dark keeps it: the choice is remembered, and it is the only thing that picks the
dark theme (`public/theme.js` decides before first paint, so the wrong theme never flashes). Dark
stays for the garage: a scan is black lines on white paper, so on a graphite page the drawing is
the brightest thing on screen, which is what a phone in a dim garage wants. `paper` is white in
both themes, because the sheet a drawing was printed on does not care how the reader's phone is
set.

**The header and footer are graphite in both themes.** They are the website's graphite,
`#24272d`, measured, and they are the `.chrome` scope in the tokens, which wears the dark theme's
values whatever the page does. So everything in them — a link, the session control, the theme
button, the status strip — is measured against graphite, not against the page.

**The Club's wordmark is in the header** (#209): the website's own white logo, *ISO BIZZARRINI /
CLUB DEUTSCHLAND e.V.*, committed under `apps/web/public/club/` and set by `wordmark.tsx`, with
the Club's name as its alternative text. It is white, so it only ever sits on the graphite.
"Ricambi" stands beside it in small muted type, ruled apart, until #158 decides the product's
name; on a phone it stacks under the logo, so the row keeps its height and its controls their
touch size, and the logo scales down rather than the header wrapping. Nothing is mounted at
deploy time: every system serves the logo itself.

**One value is deliberately under the bar, and it is a state the member switched on.** When a
member asks to see a Sub-assembly on a drawing, the circles that are *not* in it recede to
`--mark-receded` — the Mark's ultramarine at 30%, which measures 1.6:1 on paper and clears
nothing. That is the point: it is the navigator's scrim applied to circles instead of to the
sheet, so "the bright ones are the ones you asked for" needs no legend. Nothing is taken away —
every receded circle is still there, still hittable at its full 44px, and one press on the same
control brings the sheet back. A mark that a member has not asked to have receded never wears it.

**Built for a garage.** This is the actual usage context, not an accessibility afterthought.
Nothing interactive is under 44px in either dimension — `--spacing-control`, and the one place
that figure is also written as a number is `MARK_TOUCH` in the drawing viewer, which has to do
the arithmetic in the drawing's own pixels and cannot read a token to do it. Body text clears
4.5:1 against its surface and non-text marks clear 3:1, including the faintest tokens. The focus
ring is 3px of ink — the text colour, graphite on the white page and white on graphite — so it is
the strongest contrast the surface has (14.6:1 on white, 13.7:1 on graphite) and can never read
as the accent or a Mark. A Mark is focused on paper in both themes and always takes the graphite
ring.

**Labels are sentences, not stamps.** Whatever names the thing under it — a section, a field, a
column — is the `.label` class: small, weighted, in the sentence's own case, and in Open Sans,
because it is interface type even where it names a section. A word of standing beside something
else ("Not drawn", "2 places", a role) is `.tag`. Nothing in the interface is set in small
capitals except the proof stamp, which is meant to look stamped.

**The one ornament is Ricambi's roundel.** A thin-ruled circle quartered by a diagonal cross —
the geometry of the Club's own emblem, which doubles as the registration mark a printer aligns a
plate with. It appears on empty states and, drawn heavier, as the favicon, and nowhere else; the
header wears the Club's wordmark instead. Every drawing in this archive was printed once; that is
the only reference the interface makes to it.

**English throughout.** The Club website is German. Neither borrows the other's language.

**The one element that does not recede is the proof stamp.** A non-production system wears a
band across the top — orange, hatched along its bottom edge like the margin of a printer's proof
sheet, carrying `DEMO` and one plain sentence; Development wears the same band in magenta, so a
developer can tell their own machine from Integration at a glance. Everything else in this
interface gets out of the drawing's way; this does not, because the failure it prevents is
someone taking practice data for the archive. It is the same colour in light and dark, because it
is a mark printed *on* the archive rather than part of it, and it must look identical in a
screenshot however the reader's phone is set. Its hues are ones the Club uses nowhere — that is
what makes it legible as "not the real thing" — and it is orange where a failure is red, and a
band rather than a line of text, so it reads as a caution label and not as something that went
wrong.

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
| Headings and display | Raleway 500 | **The Club website's heading face**, at the one weight it sets headings in, and the only weight shipped. Every `h1`–`h6`, and the `.display` class: a car's name, a front door, at poster size and drawn in a little (`--tracking-display`). Never for anything read in a sentence. |
| Body and interface | Open Sans Variable | The Club website's body face. Humanist, tall x-height, unfussy at small sizes and at arm's length. |
| Every factory number | IBM Plex Mono | **Ours, and additive.** Tabular figures and a slashed zero, so two catalog numbers can be told apart by eye. The Club site has no numbers to compare and therefore no opinion. |

**Two type steps, and the garage keeps its own.** Below the breakpoint at which a drawing sits
beside its parts (64rem) every size is what a phone at arm's length needs. From it up, a laptop
reads a step denser (`--type-*` in the tokens), so the archive shows more at once on a desk. Only
type moves: controls, touch targets and contrast are the same at every width, and nothing read as
a sentence goes below 14px.

All three are self-hosted, Latin subsets only. No request ever leaves for a font, so no consent
is owed for one — the same rule the Club website is being rebuilt to satisfy, and the reason its
current cookie banner exists.

## Icons

**The favicon is Ricambi's roundel, drawn again for 16px** (#207): an off-white disc (`#f9fafb`)
with a graphite ring and cross at strokes heavy enough to survive a browser tab, the cross
stopping short of the ring, and a thin graphite outer edge. It ships as `favicon.svg`, with a
32px `favicon.ico`.

**The large icons are the Club's emblem on graphite**, at about 80% of the square: the 180px
`apple-touch-icon`, and 192 and 512px in a minimal `manifest.webmanifest`. The emblem is cut from
the website's own logo and committed as `apps/web/icons/club-emblem.png`, the source the icons
were drawn from. The 512px icon is also a public page's link preview.

**A practice system's icons are tinted, and never the emblem.** Development and Integration show
the roundel filled with their band's colour — `#f08f47` for Integration, `#d78adb` for
Development, the band tokens converted to sRGB — with the graphite ruling on top, on the favicon
and on the large icons alike, the large ones on the same graphite square as Production's. Their
manifests name them DEMO and DEV. So a practice system saved to a home screen can never pass for
the archive. While Production and Integration share one build, the markup links Integration's
icons and `public/theme.js` points them at Production's or Development's at load time: a system
that fails to say what it is wears a practice icon, never the emblem. A build per system arrives
with #176.

## Tokens

Defined once in `apps/web/src/styles/tokens.css`, consumed everywhere as semantic names —
`bg-surface`, `text-muted`, `border-line`, `h-control`. **A colour, spacing, radius or type
value written inline in feature code is a bug in the token file, not a shortcut.**

The layers are: raw values in `:root`, `.dark` and `.chrome` → semantic names in `@theme inline`
→ utility classes in components. Feature code only ever sees the third layer.

## Where the identity comes from

**It was measured, not invented.** The values are the Club website's, as it is live at
https://www.isoclub-deutschland.de/ (a WordPress site on the Avada theme), converted to OKLCH:

| | The Club website | Ricambi's token |
| --- | --- | --- |
| Accent | Teal `#2ba0a3`: the current page, active tabs, links | `accent`, exactly; `accent-ink` darkened along its hue for text |
| Header and footer | Graphite `#24272d` (menus `#292d33`) | `surface-raised` in `.chrome`, exactly |
| Page | White | `surface` and `paper` |
| Heading ink | `#242930` | `text` and `focus`, exactly |
| Headings | Raleway 500, every `h1`–`h6` in the content | `--font-display`, 500 only |
| Body | Open Sans | `--font-sans` |
| Logo | White wordmark on transparent, 232×54 and a 464×108 retina version | `public/club/wordmark.png` and `wordmark-retina.png`, the same files |

**Only lightness was changed, and only where contrast demanded it.** The teal could not carry
text on white and was darkened along its own hue; the body grey could not carry text at 4.5:1 as
this archive's `muted`, and was moved along its own lightness axis until it cleared the bar and
no further.

A third was found later, doing the same arithmetic for the non-production surfaces: dark
`text-faint` cleared 4.5:1 against the page but reached only 4.20 against `surface-raised`,
which is where it is actually used — the status strip in the footer. It was lifted from 0.625 to
0.645. **Measure a token against the surface it sits on, not against the page.**

**Measured again on 2026-11-02 (#210), against the site's stylesheets as served.** The teal,
the graphite, the menu graphite, the heading ink, the white page, Raleway 500 for headings and
Open Sans for the body are unchanged, and the wordmark files are byte for byte the ones the site
serves. What the stylesheets show that Ricambi does not take, on purpose or as a known gap:

- **The website sets its main menu and footer widget titles in Montserrat, and its buttons in
  PT Sans.** Ricambi sets all of its interface in Open Sans: three faces for one archive's
  controls would be decoration, and the headings and body are what a member reads as the
  website's.
- **The website's footer has a second, slightly lighter graphite bar** (`#2b2e35`) for its
  copyright line, with its text in `#5a5d62`. Ricambi's footer is one graphite, and its text is
  the chrome's measured `muted` and `faint`, because `#5a5d62` on graphite is 2.3:1.
- **The rule and the greys carry a faint cool tint** (`line` is `#e2e3e8`), from an earlier
  capture of the site's computed styles in a browser; the stylesheets write their greys neutral
  (rules `#e5e5e5` and `#ebeaea`, body `#333333` and `#747474`). The difference is below what
  reads as a colour on a screen, and was left as it is.

**The Club's identity is committed; its people are not** (ADR 0020). The wordmark and the emblem
come from the website as published (white on transparent PNG; no vector original is known).

**History.** Until ADR 0020, Ricambi opened dark and wore an accent pair of its own — a
champagne for what is pressed and an ice blue for what points — with display lettering in Barlow
Condensed and its own roundel and wordmark in the header. That was ADR 0014, and ADR 0020
superseded it on 2026-11-01 (#201), because nothing in it tied the archive to the Club.

**Measure this again when the Club website is rebuilt.** The values above are a snapshot of a
WordPress theme that is being replaced. The rebuilt website is to take over the same identity;
if it changes the Club's teal, its graphite or its faces, these tokens are the one place that has
to follow — and the measurement is worth re-running against whatever replaces it, so the two
properties do not drift apart the moment the new site ships.
