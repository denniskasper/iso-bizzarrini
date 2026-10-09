# Technical and organisational measures

Art. 32 GDPR, for Ricambi. **A draft for the association to adopt** — see [README](README.md).

Split in two on purpose. The first part is enforced by the code in this repository and is true
of any system built from it. The second is the deployment's, described in
[ADR 0009](../adr/0009-deployment.md); **nothing in this repository can make it true or check
that it is**, so each line there is something the operator confirms before go-live and again
when the server changes. *The operator* here is whoever runs the server for `<CLUB>` — a person
with a login on the machine, not a role on the platform, and not necessarily an Administrator.

## Enforced by the application

**Access control.**

- The whole archive is behind a signed-in session with a live Membership, checked on every
  request — the catalog and search as well as the images ([ADR 0006](../adr/0006-private-image-storage.md)).
  Scans and photographs have no public address.
- Access ends by itself when a Membership's paid-through date passes; nobody has to revoke it.
- What is open without signing in is the sign-in and password-link screens, the service status,
  the legal notice and the privacy statement — none of which says anything about anybody.
- Responses carry `X-Robots-Tag: noindex, nofollow`.

**Role separation.**

- Three roles. A **Member** reads and offers Contributions; an **Editor** also decides
  Contributions and changes the archive; an **Administrator** also keeps the roster, records
  payments and keeps the Club's record. The roles are enforced by the API, not by which
  screens are shown.
- Personal data about other people — the roster, payments — is readable by Administrators only.
  An Editor cannot read the roster.
- A roster import cannot grant a role, and an Administrator cannot erase themselves.
- A Contribution is seen only by its author and Editors until an Editor publishes it.

**Authentication.**

- Passwords are chosen by the member from an e-mailed single-use, expiring link; an
  Administrator never sets or sees one. Stored as salted scrypt hashes.
- At least ten characters, checked against known-breached passwords, no forced rotation
  ([ADR 0003](../adr/0003-no-forced-password-rotation.md)).
- Repeated failed sign-ins lock the address tried for fifteen minutes. The lock applies equally
  to addresses not on the roster, so it does not reveal who is a member; neither does asking
  for a reset link.
- Only the hash of a link's token is stored, so a copy of the database is not a way in.
- The session is a signed cookie. Setting a password ends every other session of that Account.

**Data minimisation.**

- The roster import reads a name, an e-mail address and a paid-through date, and ignores every
  other column of the file it is given.
- Request logs have the cookie, any authorisation header and fields named `email` or `password`
  removed. A logged error keeps what the fault was and where, and drops the values a failed
  query was run with — covered by a test against a query that really fails.
- No analytics, no advertising, no third-party fonts or scripts; one cookie.
- No error-tracking service receives anything ([ADR 0011](../adr/0011-no-error-tracking-vendor.md)).

**Erasure and retention.**

- A daily sweep inside the application deletes Accounts lapsed beyond the retention period and
  payment records beyond theirs; an Administrator erases one person on request; the roster
  shows who the next sweep will delete ([ADR 0007](../adr/0007-retention-and-pseudonymised-bylines.md)).

**Separation of environments.**

- A non-production system refuses to start if it could e-mail a real person or reach a real
  payment mandate, and is visibly marked on every page
  ([ADR 0012](../adr/0012-non-production-is-the-default.md)). Practice systems hold invented
  people only.

**Integrity.**

- These rules are covered by the automated test suite, run on every change.

## The deployment's — to be confirmed by the operator

From [ADR 0009](../adr/0009-deployment.md). Tick each against the real server.

- [ ] **Encryption in transit.** TLS on both hosts, terminated by the reverse proxy with
      automatically renewed certificates; plain HTTP redirects. The application marks the
      session cookie `Secure` whenever the request arrived over TLS.
- [ ] **Location.** One server in an EU region, with `<HOSTING_PROVIDER>` under a signed
      processor agreement.
- [ ] **Host isolation.** Ricambi on its own subdomain, so the Club's public site never
      receives the session cookie.
- [ ] **Backups.** Nightly, to `<BACKUP_STORAGE_PROVIDER>` — a different provider from the host.
- [ ] **Encryption at rest, offsite.** Backups are encrypted on the server before they leave
      it; the key is held by `<KEY_HOLDERS>` and is not stored with the backups.
- [ ] **A restore has been performed**, from the offsite copy, onto a clean machine. Date:
      `<RESTORE_TESTED_ON>`.
- [ ] **Access to the server** is by named individuals with their own keys: `<OPERATORS>`. No
      shared login.
- [ ] **Updates.** The operating system and the container images are kept patched by
      `<OPERATORS>`.
- [ ] **Log retention** is thirty days and has been checked on the server —
      [log-retention.md](../operations/log-retention.md).
- [ ] **E-mail** is sent through `<EMAIL_PROVIDER>` with SPF, DKIM and DMARC, never from the
      server itself.

## Organisational

- Administrators are appointed by the board and are few. The role is removed when an officer
  leaves office.
- The membership list is exported from wherever `<CLUB>` keeps it only for the import, and the
  exported file is deleted afterwards.
- A suspected breach is reported to `<DATA_PROTECTION_CONTACT>` at once, who decides with the
  board whether the supervisory authority must be notified within 72 hours (Art. 33).
- Requests from members — access, correction, erasure — go to `<DATA_PROTECTION_CONTACT>` and
  are answered within a month.
