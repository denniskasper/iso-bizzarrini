# 01 — App skeleton with both test seams

**What to build:** The application runs end to end — browser to API to database — with both
testing seams established and running in CI. Nothing user-facing yet beyond proof that every
layer is wired together.

Everything after this ticket is written against these seams, so getting them right matters more
than the feature they carry.

**Runs locally. No server required.** Tickets 01–12 — the whole domain model, the viewer, the
marking tool, parts, listings, navigation, editor tooling — need nothing but a laptop and a
local Postgres. First deployment lands with ticket 14, where real members first need to reach
it. This stream therefore runs fully in parallel with the club website.

**Blocked by:** None — can start immediately.

**Status:** ready-for-human

- [x] Express and TypeScript API with Zod validation, layered routes → controllers → services → repositories
- [x] Drizzle on Postgres, with migrations under version control
- [x] Vite + React + shadcn/ui + Tailwind app, TanStack Router and Query
- [x] One route travelling the whole path: browser → API → database → browser
- [x] Primary test seam: the app driven in-process over real HTTP against a **real Postgres**, with none of our own code mocked
- [x] Playwright harness running against the built app
- [x] Both suites run in CI on every push
- [x] **The clock is injected**, never read from the system in domain code — expiry, reminder windows and retention all depend on it
- [x] Interfaces stubbed for the two external edges that will be faked in tests: the payment provider and the e-mail sender
- [ ] Sentry configured in its EU data region with PII scrubbing enabled — *code done and enforced; needs a Sentry project and DSN*
- [x] Configuration and secrets are per-environment; nothing environment-specific is compiled in
- [x] Runs locally with one command, against a local Postgres — no VPS, no Caddy, no DNS
- [x] Containerised so that deploying it later is configuration rather than rework
- [x] UI and design work uses the `/frontend-design` skill

## Visual language

Establish the design foundation here, once, so every later ticket inherits it rather than
inventing its own. The direction: **the Club's own identity, rendered with Apple's restraint and
Google's plainness.**

- [ ] Colour, typography and logo treatment lifted from the live Club site, so the two properties read as one organisation — capture them from the site before it is retired — *not done; stand-ins are in place and isolated for replacement*
- [x] **Apple**: the drawing is the hero and the interface recedes around it. Generous whitespace, large confident type, a restrained palette with very few accents, chrome that gets out of the way of the artwork
- [x] **Google**: the tools are plain and unambiguous. One dominant action per screen, high-contrast legible type, dense information presented calmly, no decoration on anything functional
- [x] Design tokens defined once — colour, type scale, spacing, radii — and consumed by every component; no ad-hoc values in feature code
- [x] Light and dark handled from the start. A scan is black lines on white paper; dark surrounding chrome is a hypothesis worth testing early, since it makes the drawing the brightest thing on screen
- [x] **Built for a garage**: high contrast in poor light, touch targets usable with cold or dirty hands, legible at arm's length on a phone
- [x] English throughout — the Club site is German, this is not
- [x] A short written statement of the direction lives with the code, so later tickets are not reinterpreting it from scratch

## Comments

**Implemented.** Everything above is done except the two items left unchecked, both of which
need a person rather than an agent.

**What was built.** A pnpm workspace with `apps/api` (Express 5, Zod, Drizzle on Postgres,
layered routes → controllers → services → repositories) and `apps/web` (Vite, React, Tailwind
v4, shadcn-style primitives, TanStack Router and Query), shipped as **one deployable** — in
production the API serves the built app from the same origin, and the container image proves
it. `pnpm dev` is the single command: it writes a `.env` if absent, starts Postgres, migrates,
and runs both sides.

**The end-to-end route is `GET /api/models`**, rendered as the catalog index. It reads a real
`models` table created by a real migration, so the whole path is exercised rather than
simulated. The table is deliberately minimal — brand, model, series, model years — and
**ticket 03 owns the full Model, Tavola, Position, Mark and Listing schema**; this is the
root it will extend, not a competing definition of it.

**Both seams are running.** Nine tests at the API seam (in-process over real HTTP against a
real Postgres, a schema per test worker, nothing of ours mocked) and fourteen at the browser
seam (Playwright against the *built* app served by the API, on desktop and on a phone). CI runs
both on every push, plus typecheck, lint, format and a container build.

**The three injected edges exist and are injectable; only the clock is exercised so far.** The
clock is injected everywhere — `new Date()` appears exactly once in the whole API, inside
`systemClock` — and `MutableClock` is what a test advances. The e-mail sender and the payment
provider are interfaces the harness already substitutes, but nothing calls them yet, because
nothing sends mail or takes money until tickets 14 and 18. Their default implementations
*refuse* rather than no-op, so a misconfigured environment fails loudly instead of silently
dropping an invitation or accepting an unverified webhook.

**Sentry.** The code is written and both rules are now *tested*
(`apps/api/tests/error-reporting.test.ts`): a DSN on `sentry.io` outside the EU ingest is a
startup failure, and scrubbing strips user, server name, headers, cookies, body and query
string before an event leaves. The check's limit is deliberate and stated in the test: a
**self-hosted** Sentry passes, because where it lives is an operations decision this code
cannot see. What remains is an account action — create the project in the EU region and set
`SENTRY_DSN`.

These two rules are tested directly rather than at the API seam, which the spec's "no third
layer of unit tests" rule would otherwise discourage. The rule's stated reasons — coupling to
internals, duplicating existing coverage — apply to neither: one refuses to start the process
and the other runs on the way out to a third party, so neither has an HTTP surface to be
reached through, and neither is covered anywhere else.

**The Club's identity was not captured.** It was not reachable from here, and the ticket is
right that it should be taken from the live site before that site is retired
(club-website ticket 04). Stand-ins are in place and deliberately contained: the accent is
three token values and the wordmark is one component, so replacing them touches no feature
code. `docs/design/visual-language.md` records the direction, the reasoning behind every token,
and exactly what is still provisional.

**Two contrast defects were found and fixed while reviewing the rendered screens** rather than
the code: white-on-red on the primary action reached only 3.6:1, and the faintest text token
sat just under 4.5:1. The accent is now two tokens — a fill and an ink — because one red cannot
both carry white text and be read as text itself.

## Review

`/code-review` was run across both axes. What it found, and what was done:

**Fixed.** Ad-hoc values had crept into feature code in five places, against this repo's own
freshly written rule — the wordmark's tracking is now a token, the catalog row's column measure
moved into the styles layer, the redundant tracking and the staggered animation delay were
deleted, and `ease-out-quick` is used as the utility it already was. The header's wordmark link
was about 18px tall, breaking the 44px rule; the end-to-end test that was supposed to catch
that only looked at buttons, so it missed a link — both are fixed. The sticky header's
`backdrop-blur` contradicted "depth comes from value, not from blur" and is gone. Six tokens
invented for screens that do not exist yet (`paper`, `paper-ink`, `surface-inverse`, `inverse`,
`accent-quiet`, `shadow-lifted`) were cut, along with `ModelRepository.add` and the unused
`REMINDERS_ENABLED` flag, which belongs to tickets 02 and 17 where something will actually read
it. The theme decision was being made twice — once in the pre-paint script, once in React — and
is now made once; fixing that surfaced a real bug, where the system-derived default was
immediately written to `localStorage`, so a phone switching to dark at dusk would never have
been followed.

**Two real defects fell out of the review, both in the seams rather than the feature.**

*The browser seam was testing a stale build.* The Playwright harness had
`reuseExistingServer: !CI`, so a leftover server from an earlier run was reused and the suite
passed against an old `dist`. For a seam whose entire purpose is exercising the **built** app,
that turns a green run into a lie. It now always builds and starts fresh.

*Helmet's Content-Security-Policy was blocking the pre-paint theme script.* `script-src 'self'`
blocks inline scripts, so in production — and only in production, where the API serves the app —
the script that reads a member's colour-scheme preference before first paint silently never
ran. Every deployment would have shown dark chrome regardless of what the member's phone asked
for. It is now `public/theme.js`, a same-origin render-blocking file, which CSP allows. This
was invisible to the API seam and to `vite dev`, and was caught only because the second seam
runs the real thing behind the real headers — which is the argument for having it.

**Answered rather than changed.** The review flagged `?brand=` on `/api/models` as work
belonging to ticket 03. Ticket 03 owns *grouping* ("Models are listed grouped by brand");
filtering by brand is asked for by no ticket — but it is the only validated input in the
skeleton, and this ticket asks for "Express and TypeScript API with **Zod validation**". Kept
deliberately, so that requirement is demonstrated and tested rather than declared, and the
error handler's 400-on-invalid-input contract has something exercising it.

**Left as a decision for a human.** The API's response shapes are declared twice — once in
`apps/api/src/services/`, once in `apps/web/src/lib/api.ts`. That is twelve lines today and
will multiply with every ticket. Fixing it properly means a third workspace package that both
apps depend on, which changes the Dockerfile, CI, the dev script and both tsconfigs. It is
worth doing, it is worth doing *early* given what this ticket is for, and it is a real
architectural choice rather than a cleanup — so it is flagged here rather than slipped in at
the end of an unrelated change.
