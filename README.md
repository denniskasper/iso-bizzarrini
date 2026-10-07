# Ricambi

A members-only parts reference for Iso and Bizzarrini cars, keyed to the original factory parts
catalogs. Members navigate the way enthusiasts already do: **choose a car, open the factory
drawing, click the numbered position, read the part.**

The domain language is in [`GLOSSARY.md`](GLOSSARY.md); the decisions behind the shape of this
repository are in [`docs/adr/`](docs/adr/); the specification is [`docs/spec.md`](docs/spec.md).

## Two things worth knowing

**There is no error-tracking vendor** (ADR 0011). Sentry was specified, built and tested, then
removed: it could not earn a processor agreement and 44 MB of image before there was even a
deployment. Unhandled errors are logged on the box through pino. The seam a reporter would
attach to is kept, and the decision is to be reconsidered at the first deployment that carries
real members.

**The Club's logo file is deliberately not in this repository.** It carries the association's
name, and `AGENTS.md` forbids client-identifying material here. The colour and typography *are*
the Club's, measured from its live site; the logo asset is dropped in at deploy time.

## The club website

The club's public site is a **separate stream in a separate repository** with its own host
(spec: *"No shared code, separate repositories, separate deployables, separate test suites"*).
Its spec and its tickets live in that repository, checked out beside this one as
`../club-website`. Ticket numbers written as *club-website NN* in this repository refer to those.

The two streams run in parallel and converge only at Ricambi's first deployment, where real
members first have to reach this application. The one thing neither can route around is the
club's **domain**, which the club-website stream untangles.

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
is behind the sign-in gate and there is no shared credential of any kind, so a fresh clone has
nobody who can get in. Put yourself on the roster once:

```sh
pnpm roster:invite-administrator -- --name "Your Name" --email you@example.org
```

It sets no password. It sends an invitation, and with `EMAIL_TRANSPORT=log` in your `.env` that
letter goes to the terminal you ran the command in — open the `/set-password?token=…` link out of
it and choose your own. Everybody else you add from the roster screen the same way.

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

### Pasting a catalog page, and getting one back

Open a drawing and scroll past its numbers to **A whole page at once**. Paste the rows straight
out of a spreadsheet — header row and all, tab-separated as the clipboard gives them — and the
archive says what it made of every column and every row *before* there is a button that records
anything. **Export this drawing** writes the same columns back out, so a sheet that goes out and
comes back is matched to what is already recorded rather than duplicated.

It is an editing convenience per drawing and deliberately **not** a catalog importer
([ADR 0005](docs/adr/0005-bulk-import-is-not-a-product-feature.md)). It creates Parts the archive
has never met and matches the ones it has — by Catalog Number, with the catalog's own spacing
ignored — and it never changes a Part that already exists. Correcting one is a screen where a
single Part is in front of a single person.

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
not start**: it writes its e-mail to the log so an operator can read an invitation back out, and
production refuses that outright — a link no member receives, left in a log file. The promotion
path from preview to archive is deliberately not a configuration flag.

The procedure, the secrets it needs and what to check before anybody sees it are in
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
    images/          what an upload becomes at ingest, and how it is addressed
    migration/       the club's spreadsheets and scans, loaded once and re-runnably
    storage/         where the files are, behind an interface that hides where
apps/web             Vite + React + Tailwind + shadcn/ui, TanStack Router and Query
packages/contracts   What the API promises the browser, declared once
docker/preview/      the stack a preview host runs
```

### The pictures are private, and that is load-bearing

Members contribute what they know on the understanding that only the Club sees the archive, so
no image is ever on a public path ([ADR 0006](docs/adr/0006-private-image-storage.md)). The
original and both derived images go into a directory nothing serves — `FILE_STORAGE_PATH`, a
mounted volume in any deployment — and come back out only through `/api/scans/:id/:variant` and
`/api/photographs/:id/:variant`, which refuse a request that has not signed in. The address
carries the record's id, so a re-upload is a new address and every image is cached for a year,
immutable.

**One implementation, two recipes.** A factory drawing and a photograph of a part are the same
thing to that rule and different things to an encoder: the drawing is kept lossless, because the
position numbers are the smallest marks on the sheet and a quality slider eats those first
([ADR 0013](docs/adr/0013-one-private-image-not-a-tile-pyramid.md)); a photograph is not, because
it has no such marks in it and a member is confirming a shape. Both go through `images/`, which
is also the upload path member Contributions will reuse.

The gate in front of it is the Club's roster. Every request that reaches a drawing is an Account
with a live Membership, re-checked on that request; there is no shared credential, and the way
onto an empty roster is a command run once on the box
(`apps/api/src/composition/first-administrator.ts`).

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
