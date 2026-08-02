# Ricambi

A members-only parts reference for Iso and Bizzarrini cars, keyed to the original factory parts
catalogs. Members navigate the way enthusiasts already do: **choose a car, open the factory
drawing, click the numbered position, read the part.**

The domain language is in [`CONTEXT.md`](CONTEXT.md); the decisions behind the shape of this
repository are in [`docs/adr/`](docs/adr/); the specification and tickets are in
[`.scratch/ricambi/`](.scratch/ricambi/).

## Ticket status

The tickets themselves are the source of truth — this table is a read of them, and each row
links to the file it was read from. **Progress** comes from a ticket's own checklist;
**Status** is its triage label ([`docs/agents/triage-labels.md`](docs/agents/triage-labels.md)).
A ticket is ready to pick up when everything it is blocked by is finished.

**Next up: [02](.scratch/ricambi/issues/02-non-production-environment.md) and
[03](.scratch/ricambi/issues/03-model-tavola-scan-ingest-private-tiles.md)** — both were blocked
only by 01. Ticket 03 is the critical path: it decides tiled-or-not by *measuring real scans*,
and everything from the viewer onward waits on it.

| # | Ticket | Progress | Status | Blocked by |
| --- | --- | --- | --- | --- |
| 01 | [App skeleton with both test seams](.scratch/ricambi/issues/01-app-skeleton-and-test-seams.md) | Implemented — 1 item needs a human | `ready-for-human` | — |
| 02 | [Non-production environment](.scratch/ricambi/issues/02-non-production-environment.md) | Not started | `ready-for-agent` | 01 |
| 03 | [Model, Tavola, scan ingest and private tiles](.scratch/ricambi/issues/03-model-tavola-scan-ingest-private-tiles.md) | Not started | `ready-for-agent` | 01 |
| 04 | [The drawing viewer](.scratch/ricambi/issues/04-drawing-viewer.md) | Not started | `ready-for-agent` | 03 |
| 05 | [Positions and the marking tool](.scratch/ricambi/issues/05-positions-and-marking-tool.md) | Not started | `ready-for-agent` | 04 |
| 06 | [Parts, Listings, and reading a part from a circle](.scratch/ricambi/issues/06-parts-listings-and-reading-a-part.md) | Not started | `ready-for-agent` | 05 |
| 07 | [Two-way navigation](.scratch/ricambi/issues/07-two-way-navigation.md) | Not started | `ready-for-agent` | 06 |
| 08 | [Fitments, Equivalents and Sources](.scratch/ricambi/issues/08-fitments-equivalents-sources.md) | Not started | `ready-for-agent` | 06 |
| 09 | [Sub-assemblies and Related Positions](.scratch/ricambi/issues/09-sub-assemblies-and-related-positions.md) | Not started | `ready-for-agent` | 06 |
| 10 | [Part photographs](.scratch/ricambi/issues/10-part-photographs.md) | Not started | `ready-for-agent` | 06 |
| 11 | [Editor progress view](.scratch/ricambi/issues/11-editor-progress-view.md) | Not started | `ready-for-agent` | 05, 06 |
| 12 | [Bulk paste and spreadsheet export](.scratch/ricambi/issues/12-bulk-paste-and-export.md) | Not started | `ready-for-agent` | 06 |
| 13 | [Migration scripts for the existing archive](.scratch/ricambi/issues/13-migration-scripts.md) | Not started | `ready-for-agent` | 03, 08 |
| 14 | [Accounts, Memberships, roster and invitations](.scratch/ricambi/issues/14-accounts-memberships-roster-invitations.md) | Not started | `ready-for-agent` | 01, club-website 01 |
| 15 | [Authorisation and the renewal screen](.scratch/ricambi/issues/15-authorisation-and-renewal-screen.md) | Not started | `ready-for-agent` | 03, 14 |
| 16 | [Roster spreadsheet import](.scratch/ricambi/issues/16-roster-spreadsheet-import.md) | Not started | `ready-for-agent` | 14 |
| 17 | [Renewal reminders](.scratch/ricambi/issues/17-renewal-reminders.md) | Not started | `ready-for-agent` | 14 |
| 18 | [Stripe subscriptions](.scratch/ricambi/issues/18-stripe-subscriptions.md) | Not started | `ready-for-agent` | 15 |
| 19 | [Members contribute](.scratch/ricambi/issues/19-members-contribute.md) | Not started | `ready-for-agent` | 10, 15 |
| 20 | [Editor moderation](.scratch/ricambi/issues/20-editor-moderation.md) | Not started | `ready-for-agent` | 19 |
| 21 | [Retention and erasure](.scratch/ricambi/issues/21-retention-and-erasure.md) | Not started | `ready-for-agent` | 20 |
| 22 | [Search](.scratch/ricambi/issues/22-search.md) | Not started | `ready-for-agent` | 08 |
| 23 | [Category filters](.scratch/ricambi/issues/23-category-filters.md) | Not started | `ready-for-agent` | 03 |
| 24 | [Platform legal pages and data-protection records](.scratch/ricambi/issues/24-platform-legal-pages-and-gdpr-records.md) | Not started | `ready-for-agent` | 15, 21 |

### What ticket 01 still needs from a person

One thing, and it is an account matter rather than code:

- **A Sentry project in the EU data region**, and its DSN in `SENTRY_DSN`. The code is written
  and tested — a non-EU `sentry.io` DSN is a startup failure, and every event is scrubbed before
  it leaves — but the project itself has to be created by someone with the association's
  account, along with the processor agreement that goes with it.

Also worth knowing: **the Club's logo file is deliberately not in this repository.** It carries
the association's name, and `AGENTS.md` forbids client-identifying material here. The colour and
typography *are* the Club's, measured from its live site; the logo asset is dropped in at deploy
time.

### The club website

The club's public site is a **separate stream in a separate repository** with its own host
(spec: *"No shared code, separate repositories, separate deployables, separate test suites"*).
Its eleven tickets live in [`.scratch/club-website/`](.scratch/club-website/) and none of them
has been started. The two streams run in parallel and converge only at Ricambi ticket 14, where
real members first have to reach this application.

## Running it

One command. It needs Docker (for Postgres) and Node 24.

```sh
pnpm install
pnpm dev
```

That writes a `.env` if there is not one, starts Postgres, applies the migrations, and runs the
API and the app side by side. No VPS, no Caddy, no DNS — the whole domain model, the viewer,
the marking tool and the editor tooling need nothing but a laptop.

| | |
| --- | --- |
| App (Vite) | http://localhost:5173 |
| API | http://localhost:3000/api/status |
| Postgres | `localhost:5433`, user `ricambi` |

Configuration lives in `.env`, described by [`.env.example`](.env.example). Nothing
environment-specific is compiled in: the same image runs in development, in the non-production
system and in production, and differs only by what it is handed.

## Shape

One deployable, not a service split (ADR 0008). In production the API serves the built app from
the same origin; in development Vite serves it and proxies `/api`.

```
apps/api             Express + TypeScript + Zod, Drizzle on Postgres
                     routes → controllers → services → repositories
apps/web             Vite + React + Tailwind + shadcn/ui, TanStack Router and Query
packages/contracts   What the API promises the browser, declared once
```

`packages/contracts` is **types only** — it emits no JavaScript, is consumed with `import type`,
and so needs no build step and appears in neither bundle. That is what makes it free; put a
constant or a function in there and both apps suddenly need a compiled dependency.

Three things are injected rather than reached for, because every one of them is otherwise
untestable or unsafe:

- **the clock** (`apps/api/src/platform/clock.ts`) — expiry, reminder windows, term boundaries
  and the retention sweep all depend on "now", so domain code is handed one;
- **the e-mail sender** (`platform/email.ts`) — every invitation, reset and reminder leaves
  through one interface, so a test can assert on it and a non-production environment can
  neutralise it;
- **the payment provider** (`platform/payments.ts`) — the provider owns subscriptions, retries,
  dunning and mandates; we only need to trust what it tells us.

## Testing

Two seams, and new tests are added at them rather than at new ones.

**The API seam** drives the Express app in-process over real HTTP against a **real Postgres**,
with none of our own code mocked. Each worker gets its own schema, so it runs in parallel.

```sh
pnpm db:up
pnpm test:api
```

**The browser seam** runs Playwright against the **built** app, served by the API exactly as it
is in production. Deliberately thin: it is for what the API seam cannot see.

```sh
pnpm test:e2e
```

Both run in CI on every push, along with typechecking, linting, formatting and a container
build.

## Design

The direction and the reasoning behind every token are written down in
[`docs/design/visual-language.md`](docs/design/visual-language.md). Tokens are defined once in
`apps/web/src/styles/tokens.css` and consumed everywhere; **a colour, spacing, radius or type
value written inline in feature code is a bug in the token file, not a shortcut.**

All UI work goes through the `/frontend-design` skill — a standing project rule, recorded in
[`AGENTS.md`](AGENTS.md).
