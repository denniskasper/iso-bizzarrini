# 14 — Accounts, Memberships, roster and invitations

**What to build:** An Administrator adds a person to the roster; they receive an invitation,
choose their own password, and sign in. Nobody but the member ever knows their password.

**Blocked by:** 01 — App skeleton with both test seams; club-website 03 — Transactional e-mail.

**Status:** ready-for-agent

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
