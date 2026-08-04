# 26 — Keep-alive, and a browser seam that does not flake

**What to fix:** The API closes idle connections after five seconds and never tells anybody, so a
client that pools sockets loses whichever request it happens to send into a closing one. It shows
up first as an intermittently red e2e suite; it is a production defect that the suite is
reporting rather than a defect of the suite.

**Blocked by:** nothing. Everything it touches is built.

**Status:** done

- [x] `server.keepAliveTimeout` and `server.headersTimeout` are set explicitly in `main.ts`, above any idle window a pooling client in front of this API will use — with `headersTimeout` the larger of the two, since Node measures it from the same instant
- [x] The reasoning is in a comment at the point of the change, including the Caddy relationship, so nobody "tidies away" two settings that look like defaults
- [x] There is a **reproduction** — a test that idles a pooled connection past the server's timeout and reuses it, and fails before the fix
- [x] `pnpm test:e2e` passes **five consecutive full runs** on a machine under load; a single green run does not close this
- [~] If it still flakes after the above, the number of tests doing a real scan ingest concurrently is bounded, and the bound is a written decision rather than a worker count somebody lowered until it went quiet — **not applicable, and deliberately not done.** It did still flake, and the cause was found rather than assumed: a vacuous assertion in the suite's own sign-in helper, not ingest concurrency. Bounding ingest would have been the worker-count-lowered-until-quiet move this box exists to forbid. See the second defect below.
- [x] Nothing is fixed by retrying: `retries` stays 1 in CI and 0 locally, and no `waitFor` is added to paper over a dropped request

## What was seen

Two failures in one sitting, on **different tests each time**, both on the `mobile` project:

- `marking.spec.ts:245` — "a number the sheet does not print is listed without a circle",
  `Error: apiRequestContext.get: socket hang up`
- `part-record.spec.ts:108` — "a price typed without its date is refused, and then accepted with
  one". *The error text was not captured for this one; the shared cause is inferred from the
  first, and confirming it is part of the reproduction box above.*

Both passed in isolation. The suite then passed three consecutive full runs.

**It is not a regression from the change that was in the tree at the time**, and that was checked
rather than assumed: the work was stashed, the suite run on the previous commit (green), the work
restored, and the suite run twice more (green, green).

## Why keep-alive is the prime suspect

`apps/api/src/main.ts` calls `app.listen()` and takes Node's defaults, which are a **5 second**
`keepAliveTimeout` and a 60 second `headersTimeout`. Playwright's `apiRequestContext` pools
connections. When the server closes an idle socket at the same instant the client writes a request
into it, the client sees `socket hang up` — a race, which is why it is intermittent, why it lands
on a different test each run, and why it never reproduces in isolation.

The window is unusually wide in this suite. **Twenty-five e2e tests call `openADrawingOfYourOwn`**,
which does a real `sharp` ingest between its API calls: seconds of gap, which is exactly what lets
a pooled socket go idle past five seconds and then be reused. On the machine this was seen on,
twenty cores gave Playwright ten workers against one Node process whose libuv threadpool is four,
so requests queue and the gaps stretch further.

## Why this is not a test-only fix

**Caddy pools upstream connections in exactly the same way** ([ADR 0009](../../../docs/adr/0009-deployment.md)),
so the same race exists between the proxy and this API in the real deployment — where the symptom
is not a red test but a member's request failing for no reason anybody can reproduce. Raising the
timeout at the server is the fix in both places. Lowering the worker count, adding a retry, or
giving the test client its own connection policy would each turn the suite green while leaving
production exactly as it is.

The pairing matters: `headersTimeout` must exceed `keepAliveTimeout`, because Node starts both
clocks at the same point and a `headersTimeout` below it closes the connection first.

> **Correction, on delivery.** The paragraph above is true of Node 12 and earlier and not of the
> Node this repository runs, where `headersTimeout` is measured from a request's first byte and
> does not touch an idle connection at all. It was checked rather than taken on trust. The
> pairing is still set as asked, for reasons that do hold today — see the Comments at the bottom.

## Comments

### The keep-alive fix, and one correction to the reasoning above

`apps/api/src/http/keep-alive.ts` holds the two numbers and the reasoning; `main.ts` applies it
to the listening server. A module rather than two bare lines at the composition root, because
the composition root has no test seam and the box above asks for a reproduction.

The numbers are pinned to **Caddy's documented default** — `keepalive 2m` on the reverse proxy's
upstream transport — rather than chosen to look round: 125 s for the keep-alive window and 130 s
for the headers bound. The relationship is written down in ADR 0009 as well as in the code,
because the Caddyfile is not in this repository and nothing here can fail when somebody raises
`keepalive` above two minutes.

**The stated reason for pairing the two settings is out of date, and the pairing survives for a
different reason.** This ticket says `headersTimeout` must exceed `keepAliveTimeout` "since Node
measures it from the same instant". That was true of Node 12 and earlier. It was checked rather
than assumed, against the Node 24 this repository runs:

- a server with `keepAliveTimeout` 20 s and `headersTimeout` 1 s leaves a connection idle for
  2 s completely alone — the arrangement the old advice calls a bug does nothing at all;
- the same server answers `408` and closes a request that begins its headers and never finishes
  them.

So `headersTimeout` is the slow-header bound, measured from a request's first byte, and an idle
connection is governed by `keepAliveTimeout` alone. Both behaviours are pinned as tests, so the
next reader does not restore the old rule from memory. The ordering is still set as this ticket
asks, for two present-tense reasons: the default is *derived* — `min(60s, requestTimeout)` — so
it moves silently if anyone ever sets `requestTimeout`, and a bound that matters for denial of
service should be a number somebody chose.

### The reproduction

`apps/api/tests/keep-alive.test.ts`. A **raw socket** rather than an `http.Agent`, deliberately:
an agent watches its free sockets and drops one the moment the server's FIN arrives, which hides
the exact state this is about. A pool that has not yet processed the FIN — which is every pool,
for the width of the race — writes. Idled 6 s and reused; without the fix it fails with
`Error: The server closed the connection rather than answering: socket hang up`.

Confirmed against the built artefact too, not only the unit seam: the server Playwright starts
for the browser suite advertises `Keep-Alive: timeout=125` on every answer.

### A second defect, found by the five runs, and not this ticket's

The first attempt at five consecutive runs went green, **red**, green — the red on
`corrections.spec.ts:61` with `TypeError: Cannot read properties of undefined (reading 'find')`
at `support/archive.ts:136`. Not a hang up, so it was diagnosed rather than re-run.

`signIn` in `e2e/support/gate.ts` was not waiting for anything. Its barrier was that the
"archive is members-only" heading is absent — and that heading is never rendered on `/sign-in`,
because the gate screen is the one route outside `ArchiveGate` (`router.tsx`). The assertion was
therefore answered on its first poll, before the passphrase had been sent anywhere. Twenty-five
tests call the helper and then immediately ask for `/api/models`, which is behind `editorsOnly`,
where a 401 arrives as `{ error }` — a body with no `models` key.

Reproduced deterministically before being touched, by delaying `POST /api/session` by 1.5 s:
the old helper returned still sitting on `/sign-in` and the next request got
`401 not_signed_in`; through the fixed helper the same probe returns at `/` with `200`.

The helper now waits for the catalog's own heading, which cannot be on screen unless the archive
really did admit this browser. **That is an arrangement barrier, not a retry** — it waits for the
state the helper claims to have established, which is the opposite of papering over a dropped
request. `retries` is untouched, and nothing else under `apps/web/` changed.

Ingest concurrency was never bounded, because it was never the cause. Two real defects, one in
the API and one in the suite's own scaffolding, both reproduced first.

### Result

`pnpm test:e2e`, five consecutive full runs on a loaded machine — the suite's own 10 workers on
20 cores, plus 8 busy cores alongside, which stretched each run from 107 s to 157–175 s:

| run | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| result | 162 passed | 162 passed | 162 passed | 162 passed | 162 passed |
| duration | 175 s | 168 s | 157 s | 175 s | 160 s |

API seam: 286 passed. Typecheck and lint clean.
