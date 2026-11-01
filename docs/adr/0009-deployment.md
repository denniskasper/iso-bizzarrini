# Deployment: one EU VPS, two hosts, all data on the box, offsite backups

Both the club's public site and Ricambi run on a single VPS in an EU region — required, since
the association is the controller for members' personal data and a processor agreement with
the hosting provider must be in place before real member data lands. Containers under Docker
Compose, with Caddy terminating TLS (automatic ACME for both hosts) and reverse-proxying —
**amended below: Dokploy and its Traefik instead of Caddy.**

Two hosts, not two paths: the public site on the club domain, Ricambi on its own subdomain.
A subdomain scopes the session cookie so the public site never receives it, and gives each
side its own server block, root, certificate and logs — isolation expressed in configuration
rather than in discipline.

Postgres, the original scans, generated tiles and member photographs all live on the box, so
tiles are served from local disk and the viewer stays fast. A VPS offers no durability
guarantee, and the scans plus the Marks placed on them exist nowhere else, so **nightly
encrypted backups go to a different provider**; the host's own snapshots are fast rollback,
not backup. A restore must actually be performed, not assumed.

## Consequences

**The reverse proxy's idle window and the API's keep-alive window are a pair, and the proxy's
must be the smaller.** The proxy pools its upstream connections, and a request written into a
connection the API has already closed is lost rather than retried, which reaches a member as a
request that failed for no reason anybody can reproduce. The API holds a connection for five
seconds longer than the proxy does (`apps/api/src/http/keep-alive.ts`, ticket 26), so it is never
the side that closes first. The proxy is now Traefik, and the numbers are in the amendment
below.

Transactional e-mail — invitations, reminders, renewal notices — is sent through a dedicated
provider with SPF, DKIM and DMARC configured, never from the VPS, whose shared address ranges
would put load-bearing mail in spam folders and lock members out.

## Amended (issue #19): Dokploy and Traefik, not Caddy

Decided on 2026-10-11. **The Club's deployment follows the preview onto Dokploy**, behind the
Traefik that Dokploy runs, rather than a hand-kept Compose stack behind Caddy. The preview has
been running that way since before there was a Club deployment, so the Club's is the second
service on a platform already proven rather than a second way of deploying the same image.
Dokploy supplies the build, the restart on deploy, the environment editor that keeps secrets on
the server, and the certificate and routing for each host; Caddy would have been all of that
written by hand, in a Caddyfile that is not in this repository.

**What stays true.** One host, in an EU region, under a processor agreement signed before real
member data lands. Each site on its own hostname, so the session cookie — which carries no
`Domain` attribute, pinned in `tests/signing-in.test.ts` — never reaches a sibling. Postgres and
every stored file on the box, in volumes of their own. Nightly encrypted backups to a different
provider, host snapshots as rollback only, and a restore actually performed. Transactional
e-mail through a dedicated provider. Nothing in the application ever relied on a Caddy feature:
the images are served by the application's own authenticated route (ADR 0013), not by the
proxy's `forward_auth` that ADR 0006 once described.

**What changes.**

- **Traefik terminates TLS**, through Dokploy, for every host on the box. The Compose file is
  [`docker/club/compose.yml`](../../docker/club/compose.yml); the procedure is
  [`docs/operations/club-deployment.md`](../operations/club-deployment.md).
- **The keep-alive pairing is against Traefik's ninety seconds.** Traefik's
  `serversTransport.forwardingTimeouts.idleConnTimeout` — "maximum amount of time an idle
  (keep-alive) connection will remain idle before closing itself" — defaults to `90s` in
  Traefik's own reference (Routing Configuration → HTTP → Load Balancing → ServersTransport),
  and Dokploy's generated Traefik configuration sets no servers transport. The API holds an
  idle connection for 95 seconds. **Setting `idleConnTimeout` above ninety seconds in Dokploy's
  Traefik configuration means raising `POOLING_CLIENT_IDLE_WINDOW_MS` too**; that configuration
  is not in this repository, so nothing here fails when somebody does. It is kept in the Club's
  `infra` repository (amended below), where the change is at least a commit somebody can read.
- **The non-production system runs on the same host**, as a second Dokploy service from
  [`docker/preview/compose.yml`](../../docker/preview/compose.yml), with its own database and
  volume. It cannot reach a member (ADR 0012), and it holds no copy of the archive.
- **The platform is one more thing to keep patched.** Dokploy and its Traefik are updated from
  Dokploy's panel, which should be reachable only over a private network, as the preview's is.
  **Superseded below** ("the Club's own server"): the Club's panel is public, behind two-factor
  authentication.

## Amended: the server's settings live in the Club's `infra` repository

Decided on 2026-11-01. **Once the Club's server exists, the Club's GitHub organisation holds a
private repository, `infra`, and the server's settings are kept in it**: the Docker daemon's log
driver, the journal's retention, Traefik's static configuration, the backup script and its
schedule, and how each Dokploy service is set up. Until now each of those was written on the
host and described only in prose here, so a host that was lost took them with it, and a change
to one of them (Traefik's `idleConnTimeout` above all) left no trace anybody could review.

**What stays true.** Secrets stay in Dokploy's environment editor, and the backup key with the
people who hold it; `infra` holds the names of the variables and where each value is kept, never
the values. This repository still names no host: `infra` is the Club's own and may. The
procedures stay here, in [`club-deployment.md`](../operations/club-deployment.md) and
[`log-retention.md`](../operations/log-retention.md); `infra` holds what they produce.

## Amended: the Club's own server, and who holds it

Decided on 2026-11-01, for issue #176. **The Club rents one VPS of its own, in Germany, from
`<HOSTING_PROVIDER>`, and runs its own Dokploy on it.** Integration, Production and the Club's
website share it, as above. A managed platform was ruled out: it costs several times as much,
adds a processor for every service it runs, and takes the files off the box (ADR 0013). So were
AWS and Google Cloud: three to five times the price of a German VPS of the same size, and a US
parent in the record of processing for a volunteer-run association to explain.

**Everything is the Club's.** The server, the backup storage, the mail provider and the
monitoring are contracted in the association's name and paid by it, and each processor
agreement is signed by the board. The provider account and the backup key are held by one of
the Club's administrators; the person who runs the server is a delegated user, removable without
touching anything else. The credentials live in a password manager the Club owns
(`<PASSWORD_MANAGER>`). Nothing is ordered before the board has approved the cost and the
agreements can be signed. The server is not managed from anybody's own Dokploy: a Club whose
deployment is controlled from a member's private box cannot hand it over.

**The panel is public, behind two-factor authentication.** The Club's administrators may need to
sign in, and a private network is one more thing they would have to run. So the Dokploy panel
has a hostname of its own under HTTPS; every account has its own strong password and two-factor
authentication, and an administrator's account reaches the Club's project and nothing else. SSH
takes keys only, and the provider's firewall opens 22, 80 and 443. A panel on the internet is one
that has to be kept current: **Dokploy is updated by hand once a month, and at once for a
security fix.** Ubuntu installs its own security updates and reboots at night when it must.

**CI deploys Integration through Dokploy's API**, with a token that can deploy Integration and
nothing else, held as a secret of the Club's GitHub organisation. Production is still deployed
by a person (ADR 0016).

**No proxy in front.** DNS points straight at the server, and Traefik takes its certificates from
Let's Encrypt. A proxying CDN would read every request in the clear, member sessions and
passwords included, and become a processor of the archive.

**Backups go to `<BACKUP_STORAGE_PROVIDER>`**, a different company from the host, with restic,
every night, as above.

**Liveness is checked from outside.** A box cannot report that it is dead. `<UPTIME_MONITOR>`
calls Production's `/api/status` and the website every five minutes; `/api/status` proves the
database answers as well. The backup reports the other way round: it pings `<BACKUP_MONITOR>`
after each run that succeeded, and a ping that does not arrive raises the alert, so a backup
that stops is noticed. Only what a living box can see about itself is checked on it: disk use
above 80%, mailed through the Club's mail provider. Every alert reaches the operator and an
address of the Club's. This settles ADR 0011's deferred decision: no error-tracking vendor.
