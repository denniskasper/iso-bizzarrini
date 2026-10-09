# Record of processing activities

Art. 30(1) GDPR, drafted for Ricambi. **A draft for the association to adopt** — see
[README](README.md). Names are placeholders on purpose; the real ones are on the Club's screen.

## The controller

| | |
| --- | --- |
| Controller | `<CLUB>`, `<CLUB_ADDRESS>` — as published at `/legal-notice` |
| Represented by | `<BOARD_MEMBERS>` |
| Data-protection contact | `<DATA_PROTECTION_CONTACT>` — as published at `/privacy` |
| Data protection officer | None designated. `<CLUB>` to confirm it is not required to designate one (Art. 37 GDPR, § 38 BDSG). |
| Supervisory authority | `<SUPERVISORY_AUTHORITY>` |

## What applies to every activity

- **Recipients.** The processors named at `/privacy`, in the roles in
  [the measures](technical-and-organisational-measures.md): `<HOSTING_PROVIDER>`,
  `<BACKUP_STORAGE_PROVIDER>`, `<EMAIL_PROVIDER>`. No payment provider and no error-tracking
  provider at the time of writing. Nothing is sold, shared with advertisers or sent to an
  analytics service.
- **Transfers to third countries.** None intended: the server is in an EU region
  ([ADR 0009](../adr/0009-deployment.md)). Each processor's location is recorded on the Club's
  screen and published; one outside the EU/EEA needs a transfer mechanism before it is named.
- **Security.** [Technical and organisational measures](technical-and-organisational-measures.md).

## The activities

### 1. Keeping the roster and deciding who may read the archive

| | |
| --- | --- |
| Purpose | Granting members of `<CLUB>` access to the parts archive for as long as their Membership is paid, and refusing it afterwards |
| Legal basis | Art. 6(1)(b) — membership of the association |
| Data subjects | Members of `<CLUB>`; former members until deletion |
| Data | Name, e-mail address, role (Member, Editor, Administrator), each Membership term and the date it is paid through, when the Account was added and activated |
| Source | `<CLUB>`'s own membership list, typed in or imported by an Administrator. **Only three columns are read** — name, e-mail address, paid-through date; every other column of the file is ignored and not stored. The data is not collected from the member directly, so Art. 14 applies: see [member-information.md](member-information.md). |
| Who sees it | Administrators |
| Erasure | The Account and everything on it is deleted automatically `RETENTION_YEARS` (three) years after the last day a Membership covered, or at once on request ([ADR 0007](../adr/0007-retention-and-pseudonymised-bylines.md)) |

### 2. Signing in

| | |
| --- | --- |
| Purpose | Establishing that the person at the browser is the member they say they are |
| Legal basis | Art. 6(1)(b); Art. 6(1)(f) for the count of failed attempts — the interest is keeping guessed passwords out of a members-only archive |
| Data | A salted scrypt hash of the password, never the password. A hash of each single-use invitation or reset link, with its expiry. A count of failed sign-in attempts per e-mail address offered, including addresses not on the roster, with first and last times. One session cookie in the member's browser; no session is stored on the server. |
| Recipients beyond the processors | When a password is chosen, the first five hexadecimal characters of its SHA-1 are sent to the Pwned Passwords range service to check it against known breaches. Neither the password, its full hash, nor anything identifying the member is sent ([ADR 0003](../adr/0003-no-forced-password-rotation.md)). |
| Erasure | With the Account. Links expire and are single-use. A failure count is cleared by a successful sign-in. |

### 3. Sending e-mail

| | |
| --- | --- |
| Purpose | Invitations and password-reset links. Renewal reminders are planned and not yet sent. |
| Legal basis | Art. 6(1)(b) |
| Data | E-mail address, name, the link |
| Recipients | `<EMAIL_PROVIDER>` |
| Erasure | Nothing sent is kept by Ricambi. What `<EMAIL_PROVIDER>` retains, and for how long, is in its agreement. |

### 4. Contributions and their photographs

| | |
| --- | --- |
| Purpose | Recording what members know about a Part or a Position, attributed so that other members can judge it |
| Legal basis | Art. 6(1)(b) — contributing to the Club's shared archive is part of what membership is for; Art. 6(1)(f) for keeping what was published after its author has gone — the interest is preserving the knowledge the archive exists to keep |
| Data | The member's words, the photographs they attach, the date, and their name as the byline |
| Who sees it | The author and Editors until an Editor publishes it; then every member with a live Membership. Never public: nothing is served without a session ([ADR 0006](../adr/0006-private-image-storage.md)). |
| Erasure | Unpublished Contributions and their photographs are deleted with the Account. **Published ones are kept**, word for word, and the byline becomes "a former member" — the identification goes and the knowledge stays. Personal data inside the text itself is an editorial correction on request ([ADR 0007](../adr/0007-retention-and-pseudonymised-bylines.md)). |

### 5. Recording membership payments

| | |
| --- | --- |
| Purpose | Recording that a member has paid, which is what moves their paid-through date; and keeping the association's accounts |
| Legal basis | Art. 6(1)(b); Art. 6(1)(c) with § 147 AO for retention |
| Data | Amount, currency, the date the money arrived, the reference on the transfer, the term it bought; the payer's name |
| Source | An Administrator, reading the association's bank statement. Ricambi holds no member's bank details and takes no payment itself. |
| Who sees it | Administrators |
| Erasure | **Not erased with the Account.** A payment record is kept with the payer's name until `PAYMENT_RECORD_RETENTION_YEARS` (ten) full calendar years after the year the money arrived, then deleted automatically. The privacy statement says so. |

### 6. The server's log

| | |
| --- | --- |
| Purpose | Keeping the system running and finding faults. There is no error-tracking service ([ADR 0011](../adr/0011-no-error-tracking-vendor.md)). |
| Legal basis | Art. 6(1)(f) — the interest is operating and securing the service |
| Data | For each request: the IP address it came from, the address requested, the request's headers (user-agent, referer and the like) without the cookie or any authorisation header, the status and the time. Fields named `email` or `password` are removed before a line is written. **An unhandled error is logged whole**, and a failed database query carries its parameters — which can be a name, an e-mail address or a password hash. That is rare and is a known gap, not a design: see [README](README.md). |
| Who sees it | Whoever operates the server for `<CLUB>` |
| Erasure | **Open.** Nothing in this repository rotates the log. A period is to be decided, configured on the server, and published — see [README](README.md). |

### 7. Backups

| | |
| --- | --- |
| Purpose | Being able to restore the archive, whose scans and Marks exist nowhere else |
| Legal basis | Art. 6(1)(f), Art. 32 |
| Data | Everything above except the log |
| Recipients | `<BACKUP_STORAGE_PROVIDER>`, which receives only encrypted copies |
| Erasure | A backup made before a deletion holds what was deleted until it is rotated out. The rotation period is the operator's to set and belongs here once it is: `<BACKUP_RETENTION>`. |
