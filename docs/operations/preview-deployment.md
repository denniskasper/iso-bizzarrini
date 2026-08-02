# Showing the work: a preview deployment

How to put Ricambi on a host somebody can be shown, before the Club has any infrastructure of
its own. This is a **developer's preview**, not the deployment ADR 0009 describes: one box, one
volume, no offsite backup, and nothing on it anybody would mind losing.

Everything here assumes the host runs [Dokploy](https://dokploy.com), which supplies Docker,
Traefik, automatic TLS and the domain routing. The stack itself is
[`docker/preview/compose.yml`](../../docker/preview/compose.yml).

## What the preview is, and is not

**It runs as a non-production system, and it will say so on every page.** That is not a
limitation to work around — it is the point:

- Everything is stamped with the DEMO band, the warm chrome and `DEMO` in the browser tab, so
  no screenshot of it can be mistaken for the Club's archive.
- The e-mail sender, the payment provider and the renewal reminders are all refused. It cannot
  reach a real person or a real mandate, and it will not start if it is handed something that
  could.
- Setting `ENVIRONMENT_MODE=production` on this stack **will not start**, because production
  refuses to run with the stand-in Editor gate configured (ADR 0012 and ticket 03). The
  promotion path from preview to archive is deliberately not a configuration flag.

**Nothing real goes into it.** It writes itself an invented catalog: three cars the factory
really made, four Tavole and three drawings generated in SVG. There is no import path from
anywhere, because there is no importer.

## Before you start

You need three secrets. Generate them; do not think them up.

```sh
openssl rand -base64 24   # POSTGRES_PASSWORD
openssl rand -base64 24   # EDITOR_PASSWORD  — this is what you give the person you are showing
openssl rand -hex 32      # SESSION_SECRET
```

**None of them, and no hostname, belongs in this repository** (`AGENTS.md`, Security). They go
into Dokploy's environment editor, which keeps them on the server.

## Deploying it

1. **In Dokploy, create a Compose service** in whichever project you keep your own work under.
2. Point it at this repository and set the compose path to `docker/preview/compose.yml`.
   Dokploy builds the image from the repository's `Dockerfile` — the same image the club's
   deployment will use later, since nothing environment-specific is compiled in.
3. **Environment** — paste these, with your own values:

   ```
   ENVIRONMENT_NAME=preview
   POSTGRES_PASSWORD=…
   EDITOR_PASSWORD=…
   SESSION_SECRET=…
   ```

4. **Domain** — attach your hostname to the `app` service on **port 3000**, with HTTPS and
   "redirect to HTTPS" on. Traefik requests the certificate; there is nothing to configure in
   this repository, and the hostname is never written into it.
5. Deploy. The first boot applies the migrations and writes the invented catalog; watch the
   logs for `Schema is up to date` and
   `Wrote an invented catalog into an empty practice archive`.

## Checking it before anybody sees it

- `https://<host>/api/status` reports `"mode":"non-production"` and `"database":"reachable"`.
- The home page shows the DEMO band and **"The archive is members-only."** — signed out, that
  is all anybody gets.
- Sign in with `EDITOR_PASSWORD`. Three cars, and a Grifo with two drawings and one Tavola
  reading "Not scanned yet".
- Open a drawing, then **sign out and reload it**: the page should refuse rather than show a
  broken image. That is the promise the whole archive rests on, and it is worth seeing work
  once with your own eyes.

## Showing it

Give the person the address and the passphrase. There are no accounts yet — one shared
passphrase is all there is until ticket 14 brings the roster, so everyone who signs in is
indistinguishable and everything is editable by all of them. Say so; it is a preview.

They can add cars, add drawings and upload real scans through the Editor screens. **Anything
recorded that way survives a redeployment** — the boot-time seed only ever writes into an
archive that has nothing in it. To get back to the invented catalog, remove the stack's volumes
in Dokploy and deploy again.

If real scans do get uploaded here, `pnpm scans:measure` against this database is exactly the
measurement ticket 03 is waiting on ([ADR 0013](../adr/0013-one-private-image-not-a-tile-pyramid.md)).

## What this preview deliberately does not have

- **Backups.** The volumes are the only copy. Do not put anything here that matters.
- **Accounts, Memberships or invitations** — ticket 14.
- **A processor agreement with the host.** So no real member's name or e-mail address goes on
  it, ever. Invented cars and drawings are not personal data; a roster is.
- **An EU hosting requirement**, which the archive itself has (ADR 0009) because the
  association is the controller for members' personal data. It does not bind a preview holding
  no personal data, and it binds the real deployment absolutely.
