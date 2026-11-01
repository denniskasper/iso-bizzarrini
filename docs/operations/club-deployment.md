# The Club's deployment

How to stand up the members' archive itself: Ricambi in production, on the Club's own host, on
Dokploy behind its Traefik ([ADR 0009](../adr/0009-deployment.md), as amended). It is written in
the manner of [`preview-deployment.md`](preview-deployment.md) and assumes you have read it.
Everything that differs from the preview is because **this one holds the roster and the only
copy of what the members have recorded.**

The stack is [`docker/club/compose.yml`](../../docker/club/compose.yml). The non-production
system that runs beside it is [`docker/preview/compose.yml`](../../docker/preview/compose.yml),
unchanged.

Every hostname, address and secret below is a placeholder. **None of them belongs in this
repository** (`AGENTS.md`, Security). They go into Dokploy's environment editor, which keeps
them on the server.

## What is different from the preview

| | The Club's deployment | The non-production system beside it |
| --- | --- | --- |
| Compose file | `docker/club/compose.yml` | `docker/preview/compose.yml` |
| Branch | `release`: the latest Release, and never `main` ([`releases.md`](releases.md)) | `main` |
| `ENVIRONMENT_MODE` | `production`, fixed in the file | `non-production`, fixed in the file |
| E-mail | `smtp`, delivered to real inboxes | `log`, never sent ([ADR 0012](../adr/0012-non-production-is-the-default.md)) |
| Catalog | Nothing seeded. Recorded through the Editor screens, or loaded once ([`archive-migration.md`](archive-migration.md)) | Invented, written at the first boot |
| Roster | The Club's members | Generated, every address on `example.invalid` |
| Database and files | Its own volumes, `database` and `files` | Its own volumes, `database` and `scans` |
| Backups | Nightly, encrypted, to a different provider | None |
| Deployed by | A person, pressing Deploy | CI, on every push to `main` that passes |

The two systems run the same image, differ only in configuration, and share nothing: not a
database, not a volume, not a secret. **Nothing is ever copied from the Club's deployment into
the non-production system**, and nothing in either Compose file could do it.

## Before you start

You need two secrets for the stack itself, and the e-mail provider's credentials. Generate
the first two; do not think them up, and **do not reuse the non-production system's**.

```sh
openssl rand -base64 24   # POSTGRES_PASSWORD
openssl rand -hex 32      # SESSION_SECRET
```

The things only a person can arrange — the host, DNS, the e-mail provider, the processor
agreements — are listed at the end. **No real member's data goes onto the host until the
processor agreement with the hosting provider is signed.**

## Deploying it

1. **In Dokploy, create a Compose service** in a project of the Club's own, not alongside your
   own work.
2. Point it at this repository, **on the `release` branch**, and set the compose path to
   `docker/club/compose.yml`. **Never `main`**: the archive runs a Release and nothing else, and
   `release` only ever stands on the latest one ([`releases.md`](releases.md)). The branch exists
   from the first Release on. **Leave "Autodeploy" off.** The preview is what deploys on every
   push; the archive is deployed by a person, once a Release has been cut and the preview has
   shown it working.
3. **Environment** — paste these, with the Club's values:

   ```
   ENVIRONMENT_NAME=production
   POSTGRES_PASSWORD=…
   SESSION_SECRET=…
   PUBLIC_URL=https://<RICAMBI_HOST>

   SMTP_HOST=<SMTP_HOST>
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=<SMTP_USER>
   SMTP_PASSWORD=…
   EMAIL_FROM_ADDRESS=<EMAIL_FROM_ADDRESS>
   ```

   `SMTP_SECURE=true` is TLS from the first byte, usually on port 465; `false` upgrades with
   STARTTLS, usually on 587, and a server that will not upgrade is refused rather than sent the
   password in the clear. `EMAIL_FROM_ADDRESS` is on the domain SPF, DKIM and DMARC are set on.

   These are optional, and each has a default that is right for the first day:

   | Variable | Default | Change it when |
   | --- | --- | --- |
   | `EMAIL_FROM_NAME` | `Ricambi` | Never, unless the platform is renamed. Letters are sent in its name, not the Club's |
   | `PAYMENT_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `none` | The Club takes the fee online ([`payments.md`](payments.md)) |
   | `REMINDERS_ENABLED` | `false` | An Administrator has read who would be written to ([`reminders.md`](reminders.md)) |
   | `RENEWAL_GRACE_DAYS` | `14` | The board decides otherwise |
   | `RETENTION_YEARS` | `3` | The board confirms a different figure ([ADR 0007](../adr/0007-retention-and-pseudonymised-bylines.md)) |
   | `PAYMENT_RECORD_RETENTION_YEARS` | `10` | The association's accountant says otherwise |

4. **Domain** — attach `<RICAMBI_HOST>` to the `app` service on **port 3000**, with HTTPS and
   "redirect to HTTPS" on. Traefik requests the certificate. Use a hostname of Ricambi's own,
   never a path under the Club's website: the session cookie carries no `Domain` attribute, so
   a browser keeps it to the host that set it, and the Club's site never receives it.
5. Deploy. The first boot applies the migrations; watch the logs for `Schema is up to date`.

The Compose file hands the build the checkout's `.git` as a second context, as the preview's
does, so the footer says which commit is running as well as which Version.

**If it does not start, it says why.** A production system refuses to start with
`EMAIL_TRANSPORT=log`, with a `PUBLIC_URL` on `localhost`, with any of the `SMTP_` variables
missing (it names each one), and with a seeded catalog. Anything marked required in the Compose
file fails the deployment before that, naming the variable.

**Search engines find the landing page and the Samples here, and nothing else** (ADR 0019): in
this system alone they are served without `noindex`, and `/robots.txt` and `/sitemap.xml` list
exactly them. A shared link to either is previewed with its title, description and picture. A
Sample's picture is its public copy; the landing's is the Club's logo, which is not in this
repository: mount it into the `app` service as `/app/web/club-logo.png` (a PNG, about
1200 × 630 pixels reads well in a preview). Without it the landing is shared with no picture.

## Deploying a Release, and going back

The Club's stack follows `release`, and only the release workflow moves it, to the tag of each
new Release ([`releases.md`](releases.md)). So deploying a new Version is: cut the Release, check
the preview, press Deploy here, and check the footer reads the new Version.

**Going back** is moving `release` to an older tag and deploying:

```sh
git fetch --tags origin
git push --force origin 'v1.2.4^{commit}:refs/heads/release'
```

Then press Deploy, and check the footer reads `1.2.4`. Going back does not undo a migration:
read what changed between the two Releases before going back over one, and take a backup first.

## The first Administrator

The roster is empty, so nobody can sign in. From the `app` container's terminal in Dokploy:

```sh
node dist/cli/invite-administrator.js --name "<ADMIN_USER>" --email <ADMIN_EMAIL>
```

This time **the invitation is delivered**, not written to the log. It is the first letter the
archive sends, and so the first test of the e-mail provider: it should arrive within a minute,
in the inbox and not in spam, from `Ricambi <EMAIL_FROM_ADDRESS>`, with a link to
`https://<RICAMBI_HOST>/set-password?token=…`. If it lands in spam, stop here and fix DNS
before anybody else is invited.

Open the link and choose a password. Add a second Administrator from the roster screen before
anybody else, so the Club is never one forgotten password from being locked out of its own
roster.

## Before a member is invited

Run through all of this, and record the date and who did it. Nothing here is optional.

**The system**

- [ ] `https://<RICAMBI_HOST>/api/status` reports `"mode":"production"`, the environment name
      you expect, `"database":"reachable"`, and the `version` of the latest Release.
- [ ] The footer's first entry reads that Version and the commit its tag names, as in
      `0.4.0 · a86c067`.
- [ ] There is no DEMO band anywhere, and the browser tab does not start with `DEMO`.
- [ ] Signed out, the home page shows **"The archive is members-only."** and nothing else.
- [ ] Open a drawing, **sign out and reload it**: the page refuses rather than showing the
      image.
- [ ] In the browser's developer tools, the session cookie is `HttpOnly`, `Secure`,
      `SameSite=Lax`, and **has no `Domain`**. Then open the Club's website in the same browser:
      the cookie is not sent to it.
- [ ] A password reset requested for your own address arrives, and its link works once only.
- [ ] `node dist/cli/retention-sweep.js --dry-run` in the `app` container's terminal names
      nobody who should not be named.

**The records** — these are the association's, and are listed in full in
[`docs/data-protection/README.md`](../data-protection/README.md):

- [ ] The legal notice and the data-protection contact are filled in on the Club's screen.
- [ ] Every Processor is named, and the Club's screen reads *every agreement is signed*.
- [ ] Members have been told, in the words in
      [`member-information.md`](../data-protection/member-information.md).

**The server** — the two sections below:

- [ ] The log is kept for thirty days, and checked.
- [ ] A backup has run, and **a restore has been performed** from it.

## Thirty days of logs

Every request is logged with the address it came from, so the log is kept for thirty days and
no longer. The server enforces this, not the application: follow
[`log-retention.md`](log-retention.md) on this host. It covers the application, Postgres and
Traefik, and whatever else Dokploy runs there. Then write *"The server's log is kept for 30
days."* into *Further privacy information* on the Club's screen.

## Backups

The `database` and `files` volumes are the archive. A VPS promises nothing about either, so
**every night both leave the host, encrypted, for a different provider**
(`<BACKUP_STORAGE_PROVIDER>`). The host's own snapshots are a fast way back from a bad
deployment and are not a backup.

What a backup is:

- **The database**, as a dump taken by Postgres itself, not a copy of its files while it runs:

  ```sh
  docker exec <CLUB_POSTGRES_CONTAINER> pg_dump -U ricambi -d ricambi --format=custom \
    > ricambi-$(date +%F).dump
  ```

- **The files volume**, whole. Scans, photographs and their derived images are written once and
  never changed in place, so a copy taken after the dump holds everything the dump refers to.
  `docker volume ls` shows its name, which Dokploy prefixes with the service's own.
- **Encrypted on this host, before it leaves.** Use a tool that encrypts by itself — `restic`
  does, and keeps a nightly series without copying the files volume whole every night. The key
  is held by `<KEY_HOLDERS>`, and is not stored with the backups or only on this host.
- **Not the log.** A log in a backup is a log kept for as long as the backup is.

Run it from the host's own scheduler, once a night, and have it report failure somewhere a
person reads. A backup that has stopped running says nothing; check the provider for last
night's snapshot whenever you are on the host.

How long the series is kept is the operator's to set. Write it into the record of processing
([section 7](../data-protection/record-of-processing.md)) as `<BACKUP_RETENTION>` says: an
Account erased today survives in every backup taken before it until that backup is rotated out.

## A restore, performed

**Do this before the first member is invited, and again after any change to how backups are
taken.** A backup nobody has restored is a hope.

1. In Dokploy, create a **third** Compose service from `docker/club/compose.yml`, with its own
   `POSTGRES_PASSWORD` and `SESSION_SECRET`, `ENVIRONMENT_NAME=restore-test`, and **no domain
   attached** and **no `SMTP_` variables of the real provider** — point `SMTP_HOST` at a
   hostname that does not resolve, so nothing it does can reach a member. It holds real
   members' data, so it is on this host and nowhere else.
2. Deploy it once so its volumes exist, then stop it.
3. Fetch last night's backup from the provider and decrypt it on this host.
4. Restore the files into its files volume, and the dump into its Postgres:

   ```sh
   docker exec -i <RESTORE_POSTGRES_CONTAINER> pg_restore -U ricambi -d ricambi --clean \
     --if-exists < ricambi-<DATE>.dump
   ```

5. Start it, and from its `app` container check that the counts match the Club's deployment:

   ```sh
   node -e "fetch('http://localhost:3000/api/status').then((r) => r.text()).then(console.log)"
   ```

   Then, against each Postgres, `select count(*)` from `accounts`, `tavole`, `scans` and
   `marks`; and the files volume's size against the original's. They should agree to within what was
   recorded since last night.
6. **Remove the service and its volumes** in Dokploy. Real data does not linger in a test.
7. Record the date, the backup restored, and who did it.

## The Club's infra repository

Most of what makes this host work is written on the host and nowhere else: the Docker daemon's
log driver and the journal's retention ([`log-retention.md`](log-retention.md)), Traefik's
static configuration, the backup script and its schedule, and how each Dokploy service is set
up. A VPS promises nothing about its disk, so **once the Club's server exists, the Club's GitHub
organisation holds a private repository, `infra`**, beside Ricambi and the Club's website, and
every one of those settings is kept there ([ADR 0009](../adr/0009-deployment.md), as amended).

What goes into it:

- **The host's own files**, as they are on the host and at the same paths:
  `/etc/docker/daemon.json`, `/etc/systemd/journald.conf.d/retention.conf`,
  `/etc/dokploy/traefik/traefik.yml` and anything beside it that was changed by hand, any
  `logrotate` entry, the backup script and the timer or crontab that runs it.
- **Each Dokploy service**: its name, project, repository, branch, compose path, domain and
  port, and whether it deploys automatically.
- **The names of each service's environment variables**, and where each value is kept. Not the
  values.
- **The record** this procedure asks for: who ran the checklist, which backup was restored, and
  when.

What never goes into it: **a password, a key or a token** — `POSTGRES_PASSWORD`,
`SESSION_SECRET`, the SMTP and Stripe credentials, the backup encryption key. They stay in
Dokploy's environment editor, and the backup key with `<KEY_HOLDERS>`. Being private does not
make a repository a place for secrets: it is cloned, forked and read by whoever is given access.
Hostnames may be written there; that repository, unlike this one, is the Club's alone.

**A change on the host is a commit in `infra`.** Edit the file in the repository, then copy it to
the host, never the other way round. If somebody changes something on the host first, commit it
the same day. The pairing of Traefik's idle window with `POOLING_CLIENT_IDLE_WINDOW_MS` (ADR 0009)
is the reason: a change to one that nobody can see is how the other gets left behind.

## The non-production system beside it

The second Compose service on the same host is the one Editors practise in and the board
reviews ([`non-production-environment.md`](non-production-environment.md)). **It is the
preview's file, `docker/preview/compose.yml`, with nothing changed**: it already runs the same
image with `ENVIRONMENT_MODE=non-production`, its own database and its own volume, and nothing in
it names a host. Deploy it as [`preview-deployment.md`](preview-deployment.md) says, in the
Club's project, on a hostname of its own (`<PRACTICE_HOST>`), with secrets of its own.

Its roster is **generated**, never loaded: every name in it is invented and every address is on
`example.invalid`, which nothing can deliver to. The generator is `pnpm db:seed`, which is
deliberately not in the runtime image. Run it from the image's build stage, on the practice
stack's network, with the practice stack's database and volume:

```sh
docker build --target build -t ricambi-seed .
docker run --rm \
  --network <PRACTICE_NETWORK> \
  -v <PRACTICE_SCANS_VOLUME>:/app/data \
  -e ENVIRONMENT_MODE=non-production \
  -e DATABASE_URL=postgres://ricambi:<PRACTICE_POSTGRES_PASSWORD>@postgres:5432/ricambi \
  -e FILE_STORAGE_PATH=/app/data \
  ricambi-seed pnpm --filter @ricambi/api db:seed
```

`docker network ls` and `docker volume ls` show the practice stack's names. **Check twice that
both are the practice stack's and not the Club's.** The seeder empties every table before it
writes, and although it refuses a database that has not declared itself non-production, the
variable it reads is the one you just typed.

Set `PRACTICE_MEMBER_PASSWORD` as well if the board should sign in as the generated members;
without it they are all left as invited. Then run its written check.

## What is left for a person

None of this can be done from the repository, and the archive does not open without it.

- [ ] **The board's approval** of the monthly cost and of the providers below, before anything
      is ordered. Every contract is in the association's name ([ADR 0009](../adr/0009-deployment.md),
      the Club's own server).
- [ ] **The host.** A VPS in Germany from `<HOSTING_PROVIDER>`, 4 vCPU and 8 GB to start, with
      Dokploy installed. The panel on a hostname of its own, every account with two-factor
      authentication and an administrator's limited to the Club's project. SSH by key only, and
      the firewall open on 22, 80 and 443. Ubuntu's `unattended-upgrades` on, rebooting at night.
- [ ] **The password manager** (`<PASSWORD_MANAGER>`), the Club's, holding every login below,
      the backup key and the two-factor recovery codes.
- [ ] **The processor agreement with the hosting provider**, signed before any member's data is
      on the host — and the hosting provider named as a Processor on the Club's screen.
- [ ] **The `infra` repository** in the Club's GitHub organisation, private, holding the host's
      settings as [the section above](#the-clubs-infra-repository) lists, and nobody's secret.
- [ ] **The Compose services in Dokploy**: the Club's, from `docker/club/compose.yml`, and the
      non-production system's, from `docker/preview/compose.yml`, each with its own secrets.
- [ ] **DNS**: `<RICAMBI_HOST>`, `<PRACTICE_HOST>` and the panel's hostname pointing straight at
      the host, with no proxy in front.
- [ ] **CI deploys the non-production system** through Dokploy's API, with a token that can
      deploy it and nothing else, as an organisation secret.
- [ ] **The e-mail provider**: chosen, with a processor agreement signed and the provider named
      on the Club's screen; and on the sending domain, **SPF, DKIM and DMARC** set as the
      provider says. Prove it with the first Administrator's invitation landing in an inbox,
      not in spam.
- [ ] **The Club's logo** mounted as `/app/web/club-logo.png`, for the landing's link preview.
- [ ] **The backup provider** (`<BACKUP_STORAGE_PROVIDER>`): a different company from the host,
      with a processor agreement and a key held by named people.
- [ ] **Monitoring**: `<UPTIME_MONITOR>` calling `https://<RICAMBI_HOST>/api/status` and the
      website every five minutes; the backup pinging `<BACKUP_MONITOR>` after each run that
      succeeded; disk use above 80% mailed from the box. Every alert to the operator and an
      address of the Club's.
- [ ] **Who reads the log, and how often.** [ADR 0011](../adr/0011-no-error-tracking-vendor.md)
      deferred the error-tracking decision to the first deployment, and ADR 0009 (the Club's own
      server) settled it: no vendor, errors logged on the box. Write down who reads that log.
