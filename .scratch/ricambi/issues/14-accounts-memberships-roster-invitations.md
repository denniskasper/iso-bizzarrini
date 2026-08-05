# 14 — Accounts, Memberships, roster and invitations

**What to build:** An Administrator adds a person to the roster; they receive an invitation,
choose their own password, and sign in. Nobody but the member ever knows their password.

**Blocked by:** 01 — App skeleton with both test seams.

**Status:** ready-for-agent — the application half, below, needs nothing but a laptop.

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

- [ ] Account (one per person, keyed by e-mail), Membership (with a Paid-through date) and Club (one row) exist; access requires at least one Membership whose Paid-through has not passed
- [ ] Roles: Member, Editor, Administrator
- [ ] An Administrator adds a person with name, e-mail and Paid-through date
- [ ] An Administrator can record a payment received by bank transfer, moving the Paid-through date
- [ ] The roster screen distinguishes **invited / activated / lapsed** — "I paid, why can't I get in" must be answerable
- [ ] Invitation e-mail carries a **single-use, expiring, re-sendable** link
- [ ] The member sets their own password; an Administrator never sees or sets it
- [ ] Passwords: minimum 10 characters, **no composition rules**, checked against a known-breached-password range API, and **never forced to rotate**
- [ ] Sign in, sign out, and self-service reset by single-use e-mailed link
- [ ] Unknown e-mail and wrong password produce the **same** generic failure, with standing guidance to contact the Club office — the sign-in form must never reveal who is on the roster
- [ ] Repeated failed attempts are rate limited and locked out
- [ ] Sessions are long-lived, with explicit sign-out for shared computers
- [ ] The Club row holds the fee, bank details, payment reference format and reminder text, all editable without a deployment
- [ ] UI and design work uses the `/frontend-design` skill
