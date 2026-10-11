import { createServer, type Server } from 'node:http';
import { connect, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyKeepAlivePolicy,
  HEADERS_TIMEOUT_MS,
  KEEP_ALIVE_TIMEOUT_MS,
  POOLING_CLIENT_IDLE_WINDOW_MS,
} from '../src/http/keep-alive.js';

/**
 * **The reproduction for ticket 26.** A client that pools connections — Traefik in front of
 * every deployment, Playwright's `apiRequestContext` in the browser suite — hands a request to a
 * socket it has been holding idle. If the server has already decided to close that socket, the
 * request goes into a connection on its way out and the client sees `socket hang up`.
 *
 * The socket here is raw rather than an `http.Agent`, and that is the point. An agent watches
 * its free sockets and quietly drops one the moment the server's FIN arrives, so it hides the
 * very state this is about. A pool that has not yet processed the FIN — which is every pool,
 * for the width of the race — behaves like this socket: it writes.
 */

/** What Node holds an idle connection for when nobody has said otherwise. */
const NODE_DEFAULT_KEEP_ALIVE_MS = 5_000;

/** Past Node's default, and short enough that the suite is not sitting here waiting for it. */
const IDLE_PAST_THE_DEFAULT_MS = NODE_DEFAULT_KEEP_ALIVE_MS + 1_000;

const BODY = 'ok';

describe('keep-alive, so a pooling client never writes into a closing socket', () => {
  const servers: Server[] = [];
  const sockets: Socket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.destroy();
    }
    await Promise.all(
      servers.splice(0).map((server) => new Promise((closed) => server.close(closed))),
    );
  });

  /** Everything this file starts answers alike; only its timeouts differ. */
  async function serverApplying(
    policy: (server: Server) => void,
    connectionsCheckingInterval?: number,
  ): Promise<Server> {
    const server = createServer({ connectionsCheckingInterval }, (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': BODY.length });
      response.end(BODY);
    });
    policy(server);
    servers.push(server);
    await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
    return server;
  }

  async function pooledConnectionTo(server: Server): Promise<Socket> {
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('The server is not listening on a port.');
    }
    const socket = connect(address.port, '127.0.0.1');
    sockets.push(socket);
    await new Promise<void>((connected, failed) => {
      socket.once('connect', connected);
      socket.once('error', failed);
    });
    // A socket dying between exchanges is this file's subject, not a reason to fell the process.
    socket.on('error', () => undefined);
    return socket;
  }

  it('answers on a connection left idle past the five seconds Node would have closed it at', async () => {
    const socket = await pooledConnectionTo(await serverApplying(applyKeepAlivePolicy));

    await exchange(socket, '/api/status');
    await idleFor(IDLE_PAST_THE_DEFAULT_MS);

    await expect(exchange(socket, '/api/models')).resolves.toContain(BODY);
  });

  it('tells the client how long it will hold the socket, so a pool can size its own window', async () => {
    const socket = await pooledConnectionTo(await serverApplying(applyKeepAlivePolicy));

    const answer = await exchange(socket, '/api/status');

    expect(answer.toLowerCase()).toContain(
      `keep-alive: timeout=${Math.floor(KEEP_ALIVE_TIMEOUT_MS / 1_000)}`,
    );
  });

  /**
   * The two behaviours that decide which of the two settings does the work here — pinned,
   * because the older and widely repeated advice says the opposite and a reader who believes
   * it will conclude the keep-alive window is the redundant one of the pair.
   *
   * On Node 12 and earlier both clocks started at the same instant and the smaller closed the
   * connection. Since Node 14 `headersTimeout` is measured from a request's first byte: it
   * bounds a request that begins its headers and never finishes them, and it does not touch a
   * connection that is merely idle. Both servers below run with `headersTimeout` far *below*
   * their keep-alive window, which is the arrangement the old advice calls a bug.
   *
   * A second rather than ninety seconds, so the suite is not waiting. **Both servers sweep every
   * 100 ms**, because Node enforces this bound on a sweep that is otherwise 30 seconds apart —
   * and an idle test that let the default stand would be waiting 2 seconds for a sweep that
   * could not fire, so it would pass whatever the semantics were and pin nothing at all.
   */
  const headersBoundBelowTheWindow = (server: Server) => {
    server.keepAliveTimeout = 20_000;
    server.headersTimeout = 1_000;
  };
  const SWEEPS_PROMPTLY = 100;

  it('leaves an idle connection alone when headersTimeout is the smaller of the two', async () => {
    const socket = await pooledConnectionTo(
      await serverApplying(headersBoundBelowTheWindow, SWEEPS_PROMPTLY),
    );

    await exchange(socket, '/api/status');
    await idleFor(2_000);

    await expect(exchange(socket, '/api/models')).resolves.toContain(BODY);
  });

  it('closes a request that begins its headers and never finishes them', async () => {
    const socket = await pooledConnectionTo(
      await serverApplying(headersBoundBelowTheWindow, SWEEPS_PROMPTLY),
    );

    await exchange(socket, '/api/status');
    socket.write('GET /api/models HTTP/1.1\r\nHost: 127.0.0.1\r\n');

    await expect(readAnswer(socket)).resolves.toContain('408');
  });

  it('holds a socket for longer than any pooling client in front of it will', () => {
    expect(KEEP_ALIVE_TIMEOUT_MS).toBeGreaterThan(POOLING_CLIENT_IDLE_WINDOW_MS);
    expect(HEADERS_TIMEOUT_MS).toBeGreaterThan(KEEP_ALIVE_TIMEOUT_MS);
  });

  it('is applied to the server that is listening, not to a copy of the numbers', async () => {
    const server = await serverApplying(applyKeepAlivePolicy);

    expect(server.keepAliveTimeout).toBe(KEEP_ALIVE_TIMEOUT_MS);
    expect(server.headersTimeout).toBe(HEADERS_TIMEOUT_MS);
  });
});

/** One request written onto a pooled socket, and the whole answer read back. */
async function exchange(socket: Socket, path: string): Promise<string> {
  const answer = readAnswer(socket);
  socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: keep-alive\r\n\r\n`);
  return answer;
}

/**
 * The next answer on this socket. **Rejects when the connection goes away instead of answering**
 * — which is this file's subject, seen from the side the client is standing on.
 *
 * Complete means the headers plus whatever `Content-Length` they promised, so an answer with no
 * body at all — Node's `408` — is read as readily as one with a body.
 */
async function readAnswer(socket: Socket): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let received = '';

    const settle = (outcome: () => void) => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('end', onGone);
      socket.off('close', onGone);
      socket.off('error', onError);
      outcome();
    };
    const onData = (chunk: Buffer) => {
      received += chunk.toString('utf8');
      const endOfHeaders = received.indexOf('\r\n\r\n');
      if (endOfHeaders === -1) {
        return;
      }
      const promised = /\r\ncontent-length: *(\d+)/i.exec(received.slice(0, endOfHeaders));
      const expected = endOfHeaders + 4 + Number(promised?.[1] ?? 0);
      if (received.length >= expected) {
        settle(() => resolve(received));
      }
    };
    const onGone = () =>
      settle(() =>
        reject(new Error('The server closed the connection rather than answering: socket hang up')),
      );
    const onError = (error: Error) => settle(() => reject(error));
    const timer = setTimeout(
      () => settle(() => reject(new Error('The server never answered.'))),
      5_000,
    );

    socket.on('data', onData);
    socket.on('end', onGone);
    socket.on('close', onGone);
    socket.on('error', onError);
  });
}

async function idleFor(milliseconds: number): Promise<void> {
  await new Promise((over) => setTimeout(over, milliseconds));
}
