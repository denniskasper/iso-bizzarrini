# Showing the work: a preview deployment

How to put Ricambi on a host somebody can be shown, before the Club has any infrastructure of
its own. This is a **developer's preview**, not the deployment ADR 0009 describes: one box, one
volume, no offsite backup, and nothing on it anybody would mind losing. The Club's own
deployment is [`club-deployment.md`](club-deployment.md); the non-production system that runs
beside it is this same stack, deployed again.

Everything here assumes the host runs [Dokploy](https://dokploy.com), which supplies Docker,
Traefik, automatic TLS and the domain routing. The stack itself is
[`docker/preview/compose.yml`](../../docker/preview/compose.yml).

## What the preview is, and is not

**It runs as a non-production system, and it will say so on every page.** That is not a
limitation to work around — it is the point:

- Everything is stamped with the DEMO band, the warm chrome and `DEMO` in the browser tab, so
  no screenshot of it can be mistaken for the Club's archive.
- It has no payment provider, so nobody is offered a way to pay online; the renewal reminders
  are refused outright, and its e-mail is written to the log rather than sent. It cannot reach a
  real person or a real mandate, and it will not start if it is handed something that could —
  a live payment key included, and `EMAIL_TRANSPORT=smtp`, the transport that delivers.
- Setting `ENVIRONMENT_MODE=production` on this stack **will not start**: it writes its e-mail to
  the log, and production refuses that outright — an invitation nobody receives, with its
  single-use secret left in a log file (ADR 0012). It seeds itself an invented catalog too, which
  production refuses as well. The promotion path from preview to archive is deliberately not a
  configuration flag.

**Nothing real goes into it.** It writes itself an invented catalog: three cars the factory
really made, four Tavole and three drawings generated in SVG. The Club's own material is never
loaded here: the archive loader ([`archive-migration.md`](archive-migration.md)) is run by hand
against the Club's deployment, and nothing in this stack calls it.

## Before you start

You need two secrets. Generate them; do not think them up.

```sh
openssl rand -base64 24   # POSTGRES_PASSWORD
openssl rand -hex 32      # SESSION_SECRET
```

There is **no shared passphrase** — there is no credential you can hand somebody. Everyone who
reaches this stack is a person on its roster with a password of their own, and the way the first
one gets there is a command you run once, after it is up. That is below.

**None of them, and no hostname, belongs in this repository** (`AGENTS.md`, Security). They go
into Dokploy's environment editor, which keeps them on the server.

## Deploying it

1. **In Dokploy, create a Compose service** in whichever project you keep your own work under.
2. Point it at this repository and set the compose path to `docker/preview/compose.yml`.
   Dokploy builds the image from the repository's `Dockerfile` — the same image the Club's
   deployment uses, since nothing environment-specific is compiled in.
3. **Environment** — paste these, with your own values:

   ```
   ENVIRONMENT_NAME=preview
   POSTGRES_PASSWORD=…
   SESSION_SECRET=…
   PUBLIC_URL=https://<your-host>
   ```

   `PUBLIC_URL` is the address invitation links point at. Get it wrong and the letters go out
   pointing somewhere nobody can reach.

4. **Domain** — attach your hostname to the `app` service on **port 3000**, with HTTPS and
   "redirect to HTTPS" on. Traefik requests the certificate; there is nothing to configure in
   this repository, and the hostname is never written into it.
5. Deploy. The first boot applies the migrations and writes the invented catalog; watch the
   logs for `Schema is up to date` and
   `Wrote an invented catalog into an empty practice archive`.

## Getting yourself in

Nobody is on the roster, so nobody can sign in — including you. Put yourself on it, from a shell
on the box:

```sh
docker compose exec app node dist/cli/invite-administrator.js \
  --name "Your Name" --email you@example.org
```

In Dokploy, the same command runs from the `app` container's terminal, without the
`docker compose exec app` in front of it.

It sets no password. It sends you an invitation, and this stack writes its mail to the log
instead of sending it — **the log of the process that sent it, which here is the command you
just ran.** The `/set-password?token=…` link is in its output, not in the application's log.

Open the link and choose a password. That is your account; from then on you add everybody else
from the roster screen, and each of them chooses their own the same way.

## Keeping it current

Every push to `main` that passes CI redeploys the preview: the last job in
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) asks Dokploy to deploy, and Dokploy
builds and restarts the stack as it does when you press the button. Nothing else deploys it —
leave Dokploy's own "Autodeploy" off, or a push would go out before CI has seen it.

The job needs five repository secrets, set once:

```sh
gh secret set DOKPLOY_URL          # https://<your-dokploy-host>, the panel's own address
gh secret set DOKPLOY_API_KEY      # Dokploy → Settings → Profile → API/CLI → generate
gh secret set DOKPLOY_COMPOSE_ID   # the id at the end of the Compose service's URL in Dokploy
gh secret set TS_OAUTH_CLIENT_ID   # Tailscale → Settings → OAuth clients, scope "Auth Keys", tag:ci
gh secret set TS_OAUTH_SECRET      # shown once, when that client is created
```

The last two are there because the panel is reachable only over Tailscale. The runner joins the
tailnet as `tag:ci` for the length of the job, so the tailnet's policy has to define that tag and
let it reach the panel — and nothing else.

A redeployment keeps the volumes, so the roster, anything recorded through the Editor screens
and every uploaded scan survive it. The job only starts the deployment; whether it came up is in
Dokploy's deployment log, and `/api/status` answers once it has.

## Checking it before anybody sees it

- `https://<host>/api/status` reports `"mode":"non-production"` and `"database":"reachable"`,
  and the Version and commit just deployed: `version` is the latest Release's, and `commit` is
  the head of `main` that CI deployed.
- The footer's first entry reads the same, as in `0.4.0 · a86c067`. If it reads the Version
  alone, the build was not handed the checkout's `.git` ([`releases.md`](releases.md)).
- The home page shows the DEMO band and **"The archive is members-only."** — signed out, that
  is all anybody gets.
- Signed in: three cars, and a Grifo with two drawings and one Tavola reading "Not scanned yet".
- Open a drawing, then **sign out and reload it**: the page should refuse rather than show a
  broken image. That is the promise the whole archive rests on, and it is worth seeing work
  once with your own eyes.

## Showing it

Add them on the roster screen, with the role you want them to have, and read their invitation out
of the application's log, since this time it is the application that sent it:

```sh
docker compose logs app | grep set-password
```

They choose their own password and nobody, you
included, ever sees it. An **Editor** can record cars, drawings and parts; a **Member** can only
read. Say which you gave them; it is a preview and the difference is the point of showing it.

They can add cars, add drawings and upload real scans through the Editor screens. **Anything
recorded that way survives a redeployment** — the boot-time seed only ever writes into an
archive that has nothing in it. To get back to the invented catalog, remove the stack's volumes
in Dokploy and deploy again.

If real scans do get uploaded here, `pnpm scans:measure` against this database is exactly the
measurement ticket 03 is waiting on ([ADR 0013](../adr/0013-one-private-image-not-a-tile-pyramid.md)).

## What this preview deliberately does not have

- **Backups.** The volumes are the only copy. Do not put anything here that matters.
- **A processor agreement with the host.** So no real member's name or e-mail address goes on
  it, ever. Invented cars and drawings are not personal data; a roster is.
- **An EU hosting requirement**, which the archive itself has (ADR 0009) because the
  association is the controller for members' personal data. It does not bind a preview holding
  no personal data, and it binds the real deployment absolutely.
