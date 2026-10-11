import type { Server } from 'node:http';

/**
 * How long a client in front of this API will hold an idle connection before dropping it.
 *
 * **Traefik is the one that matters** — Dokploy runs it in front of both the preview and the
 * Club's deployment (ADR 0009), and it pools its upstream connections. How long it keeps one
 * idle is `serversTransport.forwardingTimeouts.idleConnTimeout`, which Traefik documents as
 * defaulting to `90s` ("Maximum amount of time an idle (keep-alive) connection will remain idle
 * before closing itself", doc.traefik.io → Routing Configuration → HTTP → Load Balancing →
 * ServersTransport). Dokploy's generated Traefik configuration sets no servers transport, so the
 * default is what runs. Playwright's `apiRequestContext` pools in the same way, which is why the
 * browser suite is where this was first seen rather than where it lives.
 */
export const POOLING_CLIENT_IDLE_WINDOW_MS = 90_000;

/**
 * **The server must never be the side that closes an idle connection first.**
 *
 * Node's default is five seconds. A pool holds a connection for ninety seconds, so the pool is
 * still handing requests to a socket this server decided to close long ago — and a request
 * written into a socket that is already carrying a FIN is lost, not retried. The client sees
 * `socket hang up`. It is a race, so it is intermittent: in the browser suite it landed on a
 * different test each run and never reproduced in isolation, and in the real deployment it is
 * a member's request failing for no reason anybody can reproduce.
 *
 * Five seconds above the pool's window, so this server always outlives it. Both clocks restart
 * on every request and Traefik's starts marginally later, so the ordering holds with room over.
 * Node also advertises the number as `Keep-Alive: timeout=`, which pools that read it honour.
 */
export const KEEP_ALIVE_TIMEOUT_MS = POOLING_CLIENT_IDLE_WINDOW_MS + 5_000;

/**
 * How long a request has to finish sending its headers once it has begun — the slowloris bound,
 * after which the connection is answered `408` and closed.
 *
 * **It is not a second idle clock, whatever the older advice says.** On Node 12 and earlier it
 * was measured from the same instant as the keep-alive window, so a `headersTimeout` below that
 * window was what closed an idle connection and raising `keepAliveTimeout` alone achieved
 * nothing. That has not been true since Node 14: it is measured from a request's first byte, and
 * an idle connection is now governed by `keepAliveTimeout` alone (`tests/keep-alive.test.ts`
 * pins both halves of that). This repository requires Node 22 or newer.
 *
 * It is still set here, above the keep-alive window, for two present-tense reasons. Its default
 * is *derived* — `min(60s, requestTimeout)` — so it moves silently if anyone ever sets
 * `requestTimeout`, and a bound that matters for denial of service should be a number somebody
 * chose. And leaving it below the keep-alive window is the exact shape that used to be the bug,
 * so it would be re-litigated by every person who reads these two lines.
 */
export const HEADERS_TIMEOUT_MS = KEEP_ALIVE_TIMEOUT_MS + 5_000;

/**
 * Applied to the listening server at the composition root. **Neither line is a default being
 * restated** — see above before removing either.
 */
export function applyKeepAlivePolicy(server: Server): void {
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
}
