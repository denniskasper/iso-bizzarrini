# 14 — Accounts, Memberships, roster and invitations

**What to build:** An Administrator adds a person to the roster; they receive an invitation,
choose their own password, and sign in. Nobody but the member ever knows their password.

**Blocked by:** 01 — App skeleton with both test seams.

**Status:** ready-for-agent — the application half is **done**; the deployment half needs a host.

## This ticket has two halves, and only one of them needs a host

It was written as though it were one job, under the heading *"this is where Ricambi first needs
to exist on the internet."* That is true of **six** of its items and false of the other **fifteen**,
and reading it as one job made accounts, the roster and invitations look blocked on a VPS — and
with them tickets 15, 16 and 17, and everything behind those. They are not blocked. They are code.

**The application half runs on a laptop.** Accounts, Memberships, roles, the roster screen,
invitation tokens, password rules, sign-in and its rate limiting are all ordinary application work
with the test seams from ticket 01. The invitation e-mail is caught by a local mail catcher and the
link clicked by hand; a shared local edge already serves this application on its own hostname over
HTTPS, so the session-cookie scoping is exercisable locally too.

**The deployment half needs a host — but not the Club's.** It needs a VPS and a domain, and the
club-website stream can prove both on a domain the developer already controls. The Club's own
domain and its hosting control panel are a *cutover* concern (club-website ticket 11), which is
the last step of that project. Nothing here waits on them.

Do the application half first. The deployment half closes when there is a host to close it against.

## First deployment — needs a host

- [ ] Deployed to the Ricambi hostname behind Caddy, with automatic TLS
- [ ] Session cookie scoped to the Ricambi host, so the public club site never receives it
- [ ] A transactional e-mail provider configured for Ricambi's sending domain, with SPF, DKIM and DMARC validating. It may share an account with the club website's provider, but neither project blocks the other — this is a credential and some DNS records, not a shared component
- [ ] Invitation mail delivered to a real inbox, not spam, before any member is invited
- [ ] **The non-production system deployed alongside it, behind the same sign-in gate** — the last box of ticket 02, which built the environment but had no production to stand it beside and no gate to put it behind. It is the same image with `ENVIRONMENT_MODE=non-production`, its own database and its own generated roster; no real member's address is loaded into it. Run ticket 02's written check (`docs/operations/non-production-environment.md`) before anyone is shown it
- [ ] Reconsider the error-tracking decision (ADR 0011), which was deferred to this ticket because it carries the first deployment and the first real members

## The application — needs only a laptop

- [x] Account (one per person, keyed by e-mail), Membership (with a Paid-through date) and Club (one row) exist; access requires at least one Membership whose Paid-through has not passed
- [x] Roles: Member, Editor, Administrator
- [x] An Administrator adds a person with name, e-mail and Paid-through date
- [x] An Administrator can record a payment received by bank transfer, moving the Paid-through date
- [x] The roster screen distinguishes **invited / activated / lapsed** — "I paid, why can't I get in" must be answerable
- [x] Invitation e-mail carries a **single-use, expiring, re-sendable** link
- [x] The member sets their own password; an Administrator never sees or sets it
- [x] Passwords: minimum 10 characters, **no composition rules**, checked against a known-breached-password range API, and **never forced to rotate**
- [x] Sign in, sign out, and self-service reset by single-use e-mailed link
- [x] Unknown e-mail and wrong password produce the **same** generic failure, with standing guidance to contact the Club office — the sign-in form must never reveal who is on the roster
- [x] Repeated failed attempts are rate limited and locked out
- [x] Sessions are long-lived, with explicit sign-out for shared computers
- [x] The Club row holds the fee, bank details, payment reference format and reminder text, all editable without a deployment
- [x] UI and design work uses the `/frontend-design` skill

## Comments

**The application half is delivered.** All fourteen boxes above are answered in code, at both
seams: 411 tests at the API seam (up from 345) and 206 in the browser. The six deployment boxes
are untouched and still need a host.

**What was built.** `accounts`, `memberships`, `club`, `account_tokens` and `sign_in_failures`
(migration 0008), and the gate in front of them. A Membership is **one term** rather than a
switch, so recording a payment writes a new row and never edits an old one — which is what makes
the money auditable and gives ADR 0007's retention period something to retain.

**The gate now answers two questions, and keeps them apart.** *Authenticate* is
`account-service`; *authorise* is `access/gate.ts`. That split is what lets a lapsed member sign
in **successfully** and then be told plainly what is wrong, which is the shape ticket 15 needs.
The archive sits behind a live Membership re-checked on every request; the roster and the Club
sit behind the Administrator **role** and deliberately *not* behind a Membership, because an
Administrator who forgot to pay must not be locked out of the screen that records their payment.

**One rule was written more broadly than any box asked for, and on purpose.** Ticket 14 introduced
Members, who would otherwise have been able to reach every write in the archive. So everything
under the members-only gate that is not a `GET` requires an Editor. It fails closed and it is one
rule rather than thirty-five annotations; **ticket 15 still owns proving the whole surface**, and
that box is not ticked here.

**Passwords are scrypt at OWASP's first recommendation**, with the parameters inside the stored
string so the cost can be raised later without locking anybody out. The tests run the same scrypt
at a cheaper cost rather than a stub. The breached-password range API is the **third external
edge**, alongside e-mail and payments: the password never leaves the process — only the first five
characters of its SHA-1 do — and it fails open with a logged warning, because somebody else's
outage must not stop the Club inviting anyone.

**Two decisions worth knowing about.**

*The sign-in screen no longer offers the shared passphrase.* A form advertising it to every
stranger who finds it is worse than the problem it solves. The passphrase is still accepted by the
API, and the bootstrap it existed for is now a command — `pnpm roster:invite-administrator` — which
is strictly better: it sets no password, it sends an invitation like any other, and the first
Administrator chooses their own. Ticket 15 removes the passphrase entirely.

*`GET /api/club` is Administrator-only.* Ticket 15's renewal screen has to show a **lapsed member**
the amount, the bank details and the reference, so it will need to widen this. That is deliberately
left to 15: widening who may read the Club's bank details is a decision that belongs with the
screen that needs it, not one to make speculatively here.

**Known and accepted.** Dates are compared in UTC throughout, as they are everywhere else in this
archive, so a Membership boundary flips up to two hours early in CEST. Introducing a timezone for
it would be a change to the whole catalog's date handling, not to this ticket.

## Review

`/code-review` was run across both axes. What it found, and what was done:

**Fixed.** "The subscription" was on the Club screen, which is a word `CONTEXT.md` names in the
_Avoid_ list — it is a **Membership**. `today()` was written out twice and now lives beside the
`Clock` it reads. The currency list, the refusal sentence and the "you may not" panel were each
duplicated and are now written once; the panel becoming `AdministratorsOnly` fixed a real hole
with it, because a signed-*out* visitor to `/roster` was told the roster was the Club's to keep
and given no way to sign in. `aYearOn` did arithmetic on the *text* of an ISO date, so a term
running to 29 February proposed `2029-02-29`, which is not a day and which the date field simply
refuses to show. The payment form prefilled the Club's fee, which on an unconfigured Club is
`0.00` — an amount the archive rejects, so a first-run Administrator met a form that refused
itself until they emptied a box somebody else had filled in.

**Two real defects fell out of it, both about failure rather than about the feature.**

*Adding somebody whose invitation could not be sent answered 500, with the Account already
written.* The Administrator would retry and be told the address was taken. It now answers 502 and
says both halves — they are on the roster, and the letter did not go out — and "Send the
invitation again" on their row is the fix. Fixing that surfaced a second thing: the token is
issued before the letter can carry it, so a failed send left a live secret that had reached no
inbox, and left the roster reporting an invitation "sent". The token is now spent when the send
fails, so the screen and the truth agree.

*The roster could not tell "lapsed" from "lapsed and never activated".* Lapsed wins over invited,
which is right — the money is what has to be fixed first — but it hid the case where recording the
payment fixes only half the problem. The row now says so.

**The browser seam moved onto the real gate.** Every spec except one now signs in as a person with
an address and a password; the practice archive seeds a generated roster to sign in *as*, with
nobody real in it and every address on `example.invalid`. A password is written only if the
environment hands one in, so no credential in this repository works on a practice system deployed
from it.

**And it caught a layout defect the API could not see.** Adding two entries to the chrome for
Administrators made the header 136px wider than a phone, and a row that does not fit makes the
*whole page* scroll sideways — which put the chrome over whatever was being clicked and cost two
mobile tests in specs that have nothing to do with the roster. The header now wraps for an
Administrator and only for an Administrator: a member's chrome is unchanged, on the screens where
a drawing needs the height most.
