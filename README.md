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

**Next up: [11](.scratch/ricambi/issues/11-editor-progress-view.md)** — the Editor progress view.
Everything a Tavola can carry is now recordable, and ticket 13's loader has filled the archive
from the Club's own spreadsheets, so the question that has no answer is *what is left to do* —
which sheets have no scan, which numbers have no Mark, which have no Listing. Marking Tavole is
the project's critical path and nothing yet tells a volunteer where to start.

[10](.scratch/ricambi/issues/10-part-photographs.md), [12](.scratch/ricambi/issues/12-bulk-paste-and-export.md)
and [25](.scratch/ricambi/issues/25-correcting-a-part-and-its-listings.md) are equally pickable
and independent of it.

| # | Ticket | Progress | Status | Blocked by |
| --- | --- | --- | --- | --- |
| 01 | [App skeleton with both test seams](.scratch/ricambi/issues/01-app-skeleton-and-test-seams.md) | Done | `done` | — |
| 02 | [Non-production environment](.scratch/ricambi/issues/02-non-production-environment.md) | 10 of 11 | `done` | 01 |
| 03 | [Model, Tavola, scan ingest and private tiles](.scratch/ricambi/issues/03-model-tavola-scan-ingest-private-tiles.md) | 15 of 18 | `ready-for-human` | 01 |
| 04 | [The drawing viewer](.scratch/ricambi/issues/04-drawing-viewer.md) | 9 of 10 | `done` | 03 |
| 05 | [Positions and the marking tool](.scratch/ricambi/issues/05-positions-and-marking-tool.md) | Done | `done` | 04 |
| 06 | [Parts, Listings, and reading a part from a circle](.scratch/ricambi/issues/06-parts-listings-and-reading-a-part.md) | Done | `done` | 05 |
| 07 | [Two-way navigation](.scratch/ricambi/issues/07-two-way-navigation.md) | Done | `done` | 06 |
| 08 | [Fitments, Equivalents and Sources](.scratch/ricambi/issues/08-fitments-equivalents-sources.md) | Done | `done` | 06 |
| 09 | [Sub-assemblies and Related Positions](.scratch/ricambi/issues/09-sub-assemblies-and-related-positions.md) | Done | `done` | 06 |
| 10 | [Part photographs](.scratch/ricambi/issues/10-part-photographs.md) | Not started | `ready-for-agent` | 06 |
| 11 | [Editor progress view](.scratch/ricambi/issues/11-editor-progress-view.md) | Not started | `ready-for-agent` | 05, 06 |
| 12 | [Bulk paste and spreadsheet export](.scratch/ricambi/issues/12-bulk-paste-and-export.md) | Not started | `ready-for-agent` | 06 |
| 13 | [Migration scripts for the existing archive](.scratch/ricambi/issues/13-migration-scripts.md) | 11 of 12 | `ready-for-human` | 03, 08 |
| 14 | [Accounts, Memberships, roster and invitations](.scratch/ricambi/issues/14-accounts-memberships-roster-invitations.md) | Not started | `ready-for-agent` | 01, club-website 01 |
| 15 | [Authorisation and the renewal screen](.scratch/ricambi/issues/15-authorisation-and-renewal-screen.md) | Not started | `ready-for-agent` | 03, 14 |
| 16 | [Roster spreadsheet import](.scratch/ricambi/issues/16-roster-spreadsheet-import.md) | Not started | `ready-for-agent` | 14 |
| 17 | [Renewal reminders](.scratch/ricambi/issues/17-renewal-reminders.md) | Not started | `ready-for-agent` | 14 |
| 18 | [Stripe subscriptions](.scratch/ricambi/issues/18-stripe-subscriptions.md) | Not started | `ready-for-agent` | 15 |
| 19 | [Members contribute](.scratch/ricambi/issues/19-members-contribute.md) | Not started | `ready-for-agent` | 10, 15 |
| 20 | [Editor moderation](.scratch/ricambi/issues/20-editor-moderation.md) | Not started | `ready-for-agent` | 19, 25 |
| 21 | [Retention and erasure](.scratch/ricambi/issues/21-retention-and-erasure.md) | Not started | `ready-for-agent` | 20 |
| 22 | [Search](.scratch/ricambi/issues/22-search.md) | Not started | `ready-for-agent` | 08 |
| 23 | [Category filters](.scratch/ricambi/issues/23-category-filters.md) | Not started | `ready-for-agent` | 03 |
| 24 | [Platform legal pages and data-protection records](.scratch/ricambi/issues/24-platform-legal-pages-and-gdpr-records.md) | Not started | `ready-for-agent` | 15, 21 |
| 25 | [Correcting a Part and its Listings](.scratch/ricambi/issues/25-correcting-a-part-and-its-listings.md) | Not started | `ready-for-agent` | 06 |

**Ticket 25 is numbered last and is pickable now.** It was written after 06 landed, so it takes
the next free number rather than a place in the order — but it is blocked only by 06, and three
tickets that *are* in order already assume it exists (19, 20 and the spec's own Out of Scope all
say corrections reach the record through an Editor's hands, which today they cannot). Ticket 20 is
blocked on it.

Ticket 02's one open box — the practice system *deployed* alongside production, behind the same
sign-in gate — is carried by [ticket 14](.scratch/ricambi/issues/14-accounts-memberships-roster-invitations.md),
which lists it. The environment itself is built and runs today; there is simply nothing yet to
stand it beside.

**Ticket 03's three open boxes need a person, not code.** It asks for at least a dozen *real*
scans from the club archive to be measured before the deep-zoom question is settled, and none has
been obtained — the only genuine drawing anyone has seen was supplied downsized. The other two
are conditional on that measurement. Everything the ticket asks for in code is built, and the
measurement is now taken by the archive itself: ingest records every scan's dimensions and byte
sizes, and `pnpm scans:measure` reads them back and applies the threshold. Its fourth box closed
at ticket 05, which placed the first Mark in fractional image coordinates. See
[ADR 0013](docs/adr/0013-one-private-image-not-a-tile-pyramid.md).

**Ticket 04's one open box is the tile box, and it is open because there are no tiles.** The
same ADR 0013 serves one private image per Tavola, so "only the visible tiles are fetched" names
a delivery format this system does not have. What it was protecting is delivered either way:
listing a Model's Tavole downloads no drawing, and opening one fetches derived images only —
never the upload, which has no address at all. `pnpm scans:measure` against real scans is what
reopens it.

### Two things worth knowing about ticket 01

**There is no error-tracking vendor** (ADR 0011). Sentry was specified, built and tested, then
removed: it could not earn a processor agreement and 44 MB of image before there was even a
deployment. Unhandled errors are logged on the box through pino. The seam a reporter would
attach to is kept, and the decision is to be reconsidered at ticket 14, which carries the first
deployment and the first real members.

**The Club's logo file is deliberately not in this repository.** It carries the association's
name, and `AGENTS.md` forbids client-identifying material here. The colour and typography *are*
the Club's, measured from its live site; the logo asset is dropped in at deploy time.

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

**You will land on "The archive is members-only", and that is the archive working.** Everything
is behind the sign-in gate, so use the passphrase in `EDITOR_PASSWORD` — `.env.example` starts it
at `change-this-passphrase`, and a `.env` written before ticket 03 will not have the key at all.
Unset admits nobody, which is the safe direction and not a bug.

Signed in, you can record a car, record a drawing and upload a scan. If you would rather start
from something, **`pnpm db:seed` empties the catalog and writes an invented one** — it is
destructive on purpose, which is why it is a command a person runs rather than anything a
deployment does to itself.

Configuration lives in `.env`, described by [`.env.example`](.env.example). Nothing
environment-specific is compiled in: the same image runs in development, in the non-production
system and in production, and differs only by what it is handed.

### The commands worth knowing

| | |
| --- | --- |
| `pnpm dev` | Postgres, migrations, API and app, from nothing |
| `pnpm demo` | the built app as a practice system, with an invented catalog |
| `pnpm test` | both seams |
| `pnpm db:seed` | empty the catalog and write the invented one — a laptop command, never a deployment's |
| `pnpm db:generate` | a migration from a change to `schema.ts` (then rename it, and strip `"public".`) |
| `pnpm scans:measure` | what the archive's own scans say about the tiling question (ADR 0013) |
| `pnpm archive:load -- --source ../club-archive --dry-run` | load the Club's spreadsheets and scans — rehearse it first |

### Loading the Club's own archive

```sh
pnpm archive:load -- --source ../club-archive --dry-run
```

The Club's spreadsheets and scans become the catalog. It is **re-runnable** — every write is a
find-or-add, it fills empty fields and overwrites nothing — and the dry run *is* the load, done
inside a transaction that is abandoned at the end, so what it says it would create is what it
did create. Both write a report naming every row it could not take and the line it was on.

The material itself is never committed here (`AGENTS.md`); the loader and the plan that says
what the columns mean are. The procedure, the plan format and the one decision only a person can
make are in [`docs/operations/archive-migration.md`](docs/operations/archive-migration.md).

### The practice archive

```sh
pnpm demo
```

The **built** app, served by the API on `http://localhost:3200` exactly as a deployment serves
it, with a database of its own and an invented catalog — and a permanent banner, a warm chrome
and `DEMO` in the tab, so nobody mistakes it for the archive. It refuses to start if it has been
handed anything that could reach a real member or a real mandate.

An environment is the real archive only if it says `ENVIRONMENT_MODE=production`; everything
else is practice, deliberately ([ADR 0012](docs/adr/0012-non-production-is-the-default.md)). How
it is run and the written check that no production data is in it are in
[`docs/operations/non-production-environment.md`](docs/operations/non-production-environment.md).

## Showing it to somebody

A preview host — Dokploy, or anything that runs a Compose file behind a reverse proxy — gets the
built app, a Postgres of its own and a volume for the scans, from
[`docker/preview/compose.yml`](docker/preview/compose.yml).

It applies its own migrations, writes itself an invented catalog **only if there is nothing
there** — so nothing recorded through the Editor screens is lost to a redeployment — and is a
non-production system throughout: the DEMO band, the warm chrome, and refusals in front of
everything that could reach a real person. Setting `ENVIRONMENT_MODE=production` on it **will
not start**, because production refuses the stand-in Editor gate. The promotion path from
preview to archive is deliberately not a configuration flag.

The procedure, the three secrets it needs and what to check before anybody sees it are in
[`docs/operations/preview-deployment.md`](docs/operations/preview-deployment.md). **No hostname
and no secret is committed to this repository** (`AGENTS.md`); they live on the host.

## Shape

One deployable, not a service split (ADR 0008). In production the API serves the built app from
the same origin; in development Vite serves it and proxies `/api`.

```
apps/api             Express + TypeScript + Zod, Drizzle on Postgres
                     routes → controllers → services → repositories
    access/          who may ask — the gate, and the cookie it remembers by
    catalog/         rules about catalog text that belong to no layer
    images/          what a scan becomes at ingest, and how it is addressed
    migration/       the club's spreadsheets and scans, loaded once and re-runnably
    storage/         where the files are, behind an interface that hides where
apps/web             Vite + React + Tailwind + shadcn/ui, TanStack Router and Query
packages/contracts   What the API promises the browser, declared once
docker/preview/      the stack a preview host runs
```

### The drawings are private, and that is load-bearing

Members contribute what they know on the understanding that only the Club sees the archive, so
the scans are never on a public path ([ADR 0006](docs/adr/0006-private-image-storage.md)). The
original and both derived images go into a directory nothing serves — `FILE_STORAGE_PATH`, a
mounted volume in any deployment — and come back out only through `/api/scans/:id/:variant`,
which refuses a request that has not signed in. The address carries the scan's id, so a
re-upload is a new address and every image is cached for a year, immutable.

The gate in front of it is **a stand-in**: one shared passphrase in `EDITOR_PASSWORD`, which is
the whole of M1's "single hard-coded admin login". Accounts, Memberships and a live-membership
check on every request arrive with tickets 14 and 15. The application **refuses to start in
production** while that passphrase is set, so the stand-in cannot become the real gate by nobody
getting round to it.

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

The latter two also declare what they can reach — `reachesRealPeople`, `reachesRealMandates` —
and a non-production environment refuses to start holding one that can reach anything real.

The image store is injectable too, but it is **not** one of these: nothing fakes it. It is a
directory, and a real one in every test.

## Testing

Two seams, and new tests are added at them rather than at new ones.

**The API seam** drives the Express app in-process over real HTTP against a **real Postgres**,
with none of our own code mocked. Each worker gets its own schema, so it runs in parallel. Scan
ingest really runs and the files really land — in a temporary directory the suite throws away.

```sh
pnpm db:up
pnpm test:api
```

**The browser seam** runs Playwright against the **built** app, served by the API exactly as it
is in production. Deliberately thin: it is for what the API seam cannot see — that a drawing
actually renders, that a signed-out browser is told why rather than shown a broken picture, that
a deep link survives the gate.

```sh
pnpm test:e2e
```

Neither seam is handed a cookie: both go through the sign-in form or the sign-in route, because
a suite that stepped around the gate would be exercising an application nobody can reach.

Both run in CI on every push, along with typechecking, linting, formatting and a container
build.

## Design

The direction and the reasoning behind every token are written down in
[`docs/design/visual-language.md`](docs/design/visual-language.md). Tokens are defined once in
`apps/web/src/styles/tokens.css` and consumed everywhere; **a colour, spacing, radius or type
value written inline in feature code is a bug in the token file, not a shortcut.**

All UI work goes through the `/frontend-design` skill — a standing project rule, recorded in
[`AGENTS.md`](AGENTS.md).
