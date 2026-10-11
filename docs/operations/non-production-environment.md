# The non-production environment

An internal system where Editors can practise and the board can review, which nobody could
mistake for the real archive, and which is structurally incapable of e-mailing a member or
touching a real payment mandate.

The reasoning behind the shape of it is [ADR 0012](../adr/0012-non-production-is-the-default.md).
This file is how it is run and how it is checked.

## Running it

```sh
pnpm demo
```

That builds the app, starts Postgres, creates and migrates a database of its own, seeds it with
an invented catalog, and serves the **built** app from the API on `http://localhost:3200` —
exactly as a deployment serves it. `DEMO_DATABASE_URL`, `DEMO_PORT` and `DEMO_ENVIRONMENT_NAME`
in `.env` move it elsewhere.

## What makes it unmistakable

| | |
| --- | --- |
| Banner | Permanent, non-dismissible, on every page, travelling with the header so it cannot be scrolled away. It carries no control of any kind — there is nothing to close and nothing to remember having closed. |
| Colour | The surfaces are warm throughout. Production wears the Club's own cool graphite (or its white paper); a practice system deliberately does not wear the Club's colour at all. Hue and chroma carry the difference, so every contrast ratio holds — bar two forced exceptions in the light theme, where white cannot be warm, both re-measured. |
| Title | `DEMO — Ricambi`, stamped into the served document, so a browser tab is identifiable at a glance and DEMO survives truncation. |
| Indexing | `noindex, nofollow` in the markup and as `X-Robots-Tag` on every response, in every environment. Nothing here is for a search engine. |

The environment is written into the document by whatever serves it — `data-environment-mode` on
`<html>` — and an unmarked document is treated as practice. There is no configuration under
which this system renders without its banner.

## What it cannot do

The application **refuses to start** in a non-production environment that has been handed:

- an e-mail sender that can reach a real person (`EmailSender.reachesRealPeople`);
- a payment provider pointed at real mandates (`PaymentProvider.reachesRealMandates`);
- renewal reminders switched on (`REMINDERS_ENABLED=true`).

It fails loudly, at startup, with the reason and the variable to change. There is no runtime
path in which a practice system sends mail to a member or accepts a real webhook — the sender
and the provider it is allowed to hold cannot do either.

The seeder refuses in the opposite direction, and more strictly: it runs only where
`ENVIRONMENT_MODE` has been **declared** as `non-production`. It empties every table before it
writes, and an unset variable is silence rather than permission — which matters most in a
checkout, where the variable is likeliest to be missing and `DATABASE_URL` likeliest to be
pointed somewhere it should not be.

## Configuration

| Variable | Production | Non-production |
| --- | --- | --- |
| `ENVIRONMENT_MODE` | `production` — set deliberately, once | anything else, including unset |
| `ENVIRONMENT_NAME` | e.g. `production` | e.g. `demo` |
| `DATABASE_URL` | the archive | **its own database**, never a copy of the archive's |
| `EMAIL_TRANSPORT` | the real transport (ticket 14) | `none`, `memory` or `log` — never one that can reach an inbox |
| `PAYMENT_PROVIDER` | live keys (ticket 18) | test-mode keys |
| `REMINDERS_ENABLED` | `true` once an Administrator has previewed the recipients | must be `false` |

Everything else — the image, the migrations, the code — is identical. That is the point: the two
systems differ by configuration, so the practice one is a true rehearsal of the real one.

## Where the data comes from

`apps/api/scripts/seed.ts`, and nowhere else. The catalog in it is invented and written down in
that file: nothing is exported, copied or anonymised from production. There is no dump to import
because there is no importer, and the script lives outside `src`, so it is not in the production
image at all.

Restoring a production backup into this environment would defeat every paragraph above. It is
not a supported operation, and the check below exists to catch anyone who tries.

## The written check

**Run before this environment is first shown to anyone, and again after any restore, migration
or database change touching it.** Record the date and who ran it.

1. `GET /api/status` reports `"mode": "non-production"` and the environment name you expect.
2. The banner is on the landing page, on a deep link, and after a reload; the tab title starts
   with `DEMO`.
3. The served document carries `data-environment-mode="non-production"`, and the response
   carries `X-Robots-Tag: noindex, nofollow`.
4. `DATABASE_URL` names a database used by nothing else, and its host is not the production
   database host.
5. Every row in every table is accounted for by `scripts/seed.ts` or was created by hand in this
   environment. **No table contains a row that originated in production.** Today that is the
   `models` table; from ticket 14 it is the roster, and this step becomes the important one.
6. `EMAIL_TRANSPORT` is `none`, `memory` or `log`, never `smtp`; nothing captured or logged has ever been delivered.
7. `PAYMENT_PROVIDER` holds no live key.
8. `REMINDERS_ENABLED` is unset or `false`. (The application would not have started otherwise —
   confirm it anyway, because that is what a check is for.)

Steps 1, 2, 3, 6, 7 and 8 are enforced by the code and the tests as well; they are listed
because a check that only covers what is not already enforced is a check nobody trusts.

## What is still owed

**Deploying it alongside production is ticket 14's**, which carries the first deployment, the
Ricambi hostname and the sign-in gate both systems will sit behind. Until then the archive runs
on a laptop and there is no production to sit alongside. What this ticket delivers is the
system, complete and runnable, and the guarantee that standing it up beside production is a
second set of environment variables rather than a second set of decisions.

Two things to settle when that happens:

- **The sign-in gate.** Both systems are behind the same gate, with their own accounts. The
  practice system's roster is generated; no real member's address is loaded into it.
- **Seeding a deployed instance.** The seeder is deliberately not in the runtime image. Run it
  from a checkout or a build container against the practice database — never from the image
  serving members — with `ENVIRONMENT_MODE=non-production` set in that shell, which it will
  insist on.
