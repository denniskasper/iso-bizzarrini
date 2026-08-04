# 26 — Keep-alive, and a browser seam that does not flake

**What to fix:** The API closes idle connections after five seconds and never tells anybody, so a
client that pools sockets loses whichever request it happens to send into a closing one. It shows
up first as an intermittently red e2e suite; it is a production defect that the suite is
reporting rather than a defect of the suite.

**Blocked by:** nothing. Everything it touches is built.

**Status:** ready-for-agent

- [ ] `server.keepAliveTimeout` and `server.headersTimeout` are set explicitly in `main.ts`, above any idle window a pooling client in front of this API will use — with `headersTimeout` the larger of the two, since Node measures it from the same instant
- [ ] The reasoning is in a comment at the point of the change, including the Caddy relationship, so nobody "tidies away" two settings that look like defaults
- [ ] There is a **reproduction** — a test that idles a pooled connection past the server's timeout and reuses it, and fails before the fix
- [ ] `pnpm test:e2e` passes **five consecutive full runs** on a machine under load; a single green run does not close this
- [ ] If it still flakes after the above, the number of tests doing a real scan ingest concurrently is bounded, and the bound is a written decision rather than a worker count somebody lowered until it went quiet
- [ ] Nothing is fixed by retrying: `retries` stays 1 in CI and 0 locally, and no `waitFor` is added to paper over a dropped request

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
