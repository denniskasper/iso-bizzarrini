# 14 — Accounts, Memberships, roster and invitations

**What to build:** An Administrator adds a person to the roster; they receive an invitation,
choose their own password, and sign in. Nobody but the member ever knows their password.

**This is where Ricambi first needs to exist on the internet.** Tickets 01–12 run locally;
invitations cannot. So this ticket carries the first deployment and the sending domain.

**Blocked by:** 01 — App skeleton with both test seams; club-website 01 — VPS, Caddy and DNS.

**Status:** ready-for-agent

## First deployment

- [ ] Deployed to the Ricambi hostname behind Caddy, with automatic TLS
- [ ] Session cookie scoped to the Ricambi host, so the public club site never receives it
- [ ] A transactional e-mail provider configured for Ricambi's sending domain, with SPF, DKIM and DMARC validating. It may share an account with the club website's provider, but neither project blocks the other — this is a credential and some DNS records, not a shared component
- [ ] Invitation mail delivered to a real inbox, not spam, before any member is invited
- [ ] **The non-production system deployed alongside it, behind the same sign-in gate** — the last box of ticket 02, which built the environment but had no production to stand it beside and no gate to put it behind. It is the same image with `ENVIRONMENT_MODE=non-production`, its own database and its own generated roster; no real member's address is loaded into it. Run ticket 02's written check (`docs/operations/non-production-environment.md`) before anyone is shown it
- [ ] Reconsider the error-tracking decision (ADR 0011), which was deferred to this ticket because it carries the first deployment and the first real members

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
