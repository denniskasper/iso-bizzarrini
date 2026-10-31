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
| Purpose | Invitations and password-reset links. Where an Administrator has switched them on: one renewal reminder per membership term, thirty days before it ends, and a weekly digest to the treasurer naming members whose term is about to end or has just ended. |
| Legal basis | Art. 6(1)(b) |
| Data | E-mail address, name, the link. A reminder also carries the member's Paid-through date and payment reference; the digest carries those for each member it lists. That a term has had its reminder is recorded on the term. |
| Recipients | `<EMAIL_PROVIDER>`; for the digest, the treasurer's own mailbox, at the address set on the Reminders screen |
| Erasure | Nothing sent is kept by Ricambi. What `<EMAIL_PROVIDER>` retains, and for how long, is in its agreement. |

### 3a. A Visitor asking for membership

| | |
| --- | --- |
| Purpose | Somebody who is not a member asks the Club to join, through the form on the landing page (issue #131). Offered only where Ricambi's e-mail transport delivers. |
| Legal basis | Art. 6(1)(b), steps taken at the person's request before membership; they agree on the form to their details going to the Club office |
| Data | Name, e-mail address, the car(s) and message they chose to write. The network address the request came from, held in the server's memory for an hour to limit how often one address may ask. |
| Recipients | `<EMAIL_PROVIDER>`; the Club office's mailbox, at the address set on the Club screen |
| Erasure | Nothing is stored by Ricambi and nothing of the request is written to its log. The letter is the Club office's to keep or delete like any other it receives. |

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
| Source | An Administrator, reading the association's bank statement; or, where the association takes the fee through Ricambi ([ADR 0004](../adr/0004-payment-in-scope.md)), the payment provider's signed confirmation that a payment arrived, with a link to its receipt. Ricambi holds no member's bank or card details: those are given to the payment provider on its own page. |
| Who sees it | Administrators; each member, their own |
| Erasure | **Not erased with the Account.** A payment record is kept with the payer's name until `PAYMENT_RECORD_RETENTION_YEARS` (ten) full calendar years after the year the money arrived, then deleted automatically. The privacy statement says so. |

### 6. The server's log

| | |
| --- | --- |
| Purpose | Keeping the system running and finding faults. There is no error-tracking service ([ADR 0011](../adr/0011-no-error-tracking-vendor.md)). |
| Legal basis | Art. 6(1)(f) — the interest is operating and securing the service |
| Data | For each request: the IP address it came from, the address requested, the request's headers (user-agent, referer and the like) without the cookie or any authorisation header, the status and the time. Fields named `email` or `password` are removed before a line is written. A logged error is reduced to the kind of fault, where it was raised, the statement that failed and the constraint that refused it; the values a failed query was run with, and the row the database quotes back, are dropped. A driver's own message may still quote a single malformed value. |
| Who sees it | Whoever operates the server for `<CLUB>` |
| Erasure | **Thirty days**, enforced by the server's journal and not by the application — [log-retention.md](../operations/log-retention.md). Not included in backups. |

### 6a. Proposals, on Integration

| | |
| --- | --- |
| Purpose | Developing Ricambi: somebody the developer has let propose hands over a Fix or an Idea, worked out in conversation with Claude on Integration. Never on Production, which refuses the conversation's credential ([ADR 0012](../adr/0012-non-production-is-the-default.md), as amended). |
| Legal basis | Art. 6(1)(f) — the interest is developing the archive the Club's members use |
| Data subjects | The people let propose. A standing reminder asks them not to name members, and the summary replaces names by roles. |
| Data | Their Account, their words and screenshots, what was on screen when they started, the summary and the model that wrote it |
| Recipients | **Anthropic, as a Processor for developing Ricambi**: every turn and screenshot is sent to answer it, through a key in a workspace of its own ([proposals.md](../operations/proposals.md)). Its agreement is kept with the Club's others. |
| Who sees it | Its author while it is a Draft; once handed over, everybody let propose, and the developer |
| Erasure | A Draft is discarded by its author. `<PROPOSAL_RETENTION>` for handed-over Proposals is the Club's to set. |

### 7. Backups

| | |
| --- | --- |
| Purpose | Being able to restore the archive, whose scans and Marks exist nowhere else |
| Legal basis | Art. 6(1)(f), Art. 32 |
| Data | Everything above except the log |
| Recipients | `<BACKUP_STORAGE_PROVIDER>`, which receives only encrypted copies |
| Erasure | A backup made before a deletion holds what was deleted until it is rotated out. The rotation period is the operator's to set and belongs here once it is: `<BACKUP_RETENTION>`. |
