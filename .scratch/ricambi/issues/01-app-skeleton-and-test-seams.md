# 01 — App skeleton with both test seams

**What to build:** The application runs end to end — browser to API to database — deployed on its
own hostname, with both testing seams established and running in CI. Nothing user-facing yet
beyond proof that every layer is wired together.

Everything after this ticket is written against these seams, so getting them right matters more
than the feature they carry.

**Blocked by:** club-website 01 — VPS, Caddy and DNS serving both hosts.

**Status:** ready-for-agent

- [ ] Express and TypeScript API with Zod validation, layered routes → controllers → services → repositories
- [ ] Drizzle on Postgres, with migrations under version control
- [ ] Vite + React + shadcn/ui + Tailwind app, TanStack Router and Query
- [ ] One route travelling the whole path: browser → API → database → browser
- [ ] Primary test seam: the app driven in-process over real HTTP against a **real Postgres**, with none of our own code mocked
- [ ] Playwright harness running against the built app
- [ ] Both suites run in CI on every push
- [ ] **The clock is injected**, never read from the system in domain code — expiry, reminder windows and retention all depend on it
- [ ] Interfaces stubbed for the two external edges that will be faked in tests: the payment provider and the e-mail sender
- [ ] Sentry configured in its EU data region with PII scrubbing enabled
- [ ] Configuration and secrets are per-environment; nothing environment-specific is compiled in
- [ ] Deployed to the Ricambi hostname behind Caddy
- [ ] UI and design work uses the `/frontend-design` skill

## Visual language

Establish the design foundation here, once, so every later ticket inherits it rather than
inventing its own. The direction: **the Club's own identity, rendered with Apple's restraint and
Google's plainness.**

- [ ] Colour, typography and logo treatment lifted from the live Club site, so the two properties read as one organisation — capture them from the site before it is retired
- [ ] **Apple**: the drawing is the hero and the interface recedes around it. Generous whitespace, large confident type, a restrained palette with very few accents, chrome that gets out of the way of the artwork
- [ ] **Google**: the tools are plain and unambiguous. One dominant action per screen, high-contrast legible type, dense information presented calmly, no decoration on anything functional
- [ ] Design tokens defined once — colour, type scale, spacing, radii — and consumed by every component; no ad-hoc values in feature code
- [ ] Light and dark handled from the start. A scan is black lines on white paper; dark surrounding chrome is a hypothesis worth testing early, since it makes the drawing the brightest thing on screen
- [ ] **Built for a garage**: high contrast in poor light, touch targets usable with cold or dirty hands, legible at arm's length on a phone
- [ ] English throughout — the Club site is German, this is not
- [ ] A short written statement of the direction lives with the code, so later tickets are not reinterpreting it from scratch
