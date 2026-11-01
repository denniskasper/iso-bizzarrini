---
status: accepted
supersedes: ADR 0014
---

# Ricambi wears the Club website's identity

Members should know at first sight that Ricambi is the Club's own. Seen on Integration, the
Club's chair found nothing that tied it to the Club website, so Ricambi takes the website's
identity as it is live today, at https://www.isoclub-deutschland.de/: its teal, its white page in a
graphite frame, its heading face and its logo. This supersedes ADR 0014, which gave Ricambi an
accent pair of its own. Decided on 2026-11-01, issue #201.

## What the gap was

Measured from the website's own stylesheets (a WordPress site on the Avada theme), the two
already shared the graphite (`#24272d` for header and footer) and the body face, Open Sans. What
set them apart:

| | The Club website | Ricambi until now |
| --- | --- | --- |
| Accent | Teal `#2ba0a3`: the current page, active tabs, links | Champagne for what is pressed, ice blue for what points |
| Page | White, framed by a graphite header and footer | Dark by default |
| Headings | Raleway 500 | Barlow Condensed, light and uppercase |
| Header | The Club's white wordmark, *ISO BIZZARRINI / CLUB DEUTSCHLAND e.V.* | Ricambi's roundel and *RICAMBI* lockup |

## What it becomes

- **Teal is the one accent**, for what is pressed and for links. Where it carries text on white
  it is darkened along its own hue until it reaches 4.5:1; as a fill it stays the Club's.
- **Marks on a drawing keep a colour of their own**, chosen only for how it stands out on the
  paper of a scan. A Mark is a function, not branding. This keeps the reason ADR 0014 split the
  accent: "press this" and "this is the thing on the drawing" must never be confused. Whether it
  holds with one accent is what the prototype checks.
- **Light by default**: a white page in a graphite header and footer, as the website. Dark stays
  one press away and is remembered, for the garage.
- **Headings in Raleway 500**, the website's face. Open Sans stays for body and interface, IBM
  Plex Mono for every factory number. Barlow Condensed goes: the Club's own logo now carries the
  condensed lettering it imitated.
- **The header carries the Club's wordmark**, white on graphite, with Ricambi's name beside it in
  small type until #158 decides the product's name.
- **Favicon and home-screen icons** (from #184): Ricambi's roundel, drawn with heavier strokes, as
  the favicon; the Club's emblem on graphite for the large icons. Development and Integration
  tint the roundel in their band's colour and never show the emblem, so a practice system's icon
  cannot pass for the archive's. While Production and Integration share one build, the tint is
  chosen at load time.

**What stays Ricambi's**: the layouts. A parts archive's screens are tools around a drawing, so
the drawing-first rules, one dominant action per screen, and the garage's contrast and touch
targets all hold. Nothing is copied from the website's page layouts. E-mails stay plain text.

## The Club's identity may be committed

Until now nothing identifying the Club could be committed, because this repository is personal
and public. That rule is dropped for the Club's **identity**: its logo, its emblem, its name, its
colours and its website's address may now be in the repository. **People's names and addresses,
hostnames and credentials still may not.** The logo and emblem come from the website as published
(white on transparent PNG; no vector original is known). It was decided not to wait for the move
to a Club organisation (#176).

## Considered

- **Keeping ADR 0014's pair and only adding the logo.** Cheaper, but the accent and the dark page
  are what a member sees first, and they are what differed.
- **Teal for links only, champagne kept for actions.** Two accents again, neither of them the
  Club's whole look.
- **Matching the rebuilt Club website instead.** It is not finished. The live site is what members
  know; the rebuild is to take over the same identity, and `docs/design/visual-language.md` says
  to measure again when it ships.

## How it is checked

A throwaway prototype of exactly this design, on the start page, a Tavola and a Visitor's Sample,
in light and dark beside the website, with variants only for the Mark colour and the darkened
teal, is approved by the Club before it is built.
