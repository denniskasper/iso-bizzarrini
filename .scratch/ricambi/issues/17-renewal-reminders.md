# 17 — Renewal reminders

**What to build:** A member gets one e-mail before their Membership expires, carrying everything
they need to pay without looking anything up. Once — informed, not nagged.

**The risk in this ticket is not the feature, it is day one.** The first roster load carries
Paid-through dates nobody has checked, some of them within the reminder window. A nightly job
would then mail the whole membership, on the Club's behalf, demanding money, from unverified data.
That is unrecallable and it is the Club's reputation.

**Blocked by:** 14 — Accounts, Memberships, roster and invitations; club-website 03 —
Transactional e-mail.

**Status:** ready-for-agent

- [ ] A reminder is sent 30 days before a Membership's Paid-through date
- [ ] **At most one per membership term**, recorded on the Membership, so a re-run, retry or restore cannot double-send
- [ ] Renewal starts a new term and therefore a fresh reminder entitlement
- [ ] **Sending is disabled by default and per environment**, and must be deliberately enabled by an Administrator
- [ ] A preview screen shows exactly who would receive a reminder in the coming period, before anything is enabled
- [ ] Terms shorter than the reminder window get **no** reminder — a backfilled Membership must not receive a demand
- [ ] Content comes from the Club row: amount, bank details, payment reference, deadline — editable without a deployment
- [ ] Driven by the injected clock, so the window, term boundaries and the once-only rule are all testable
- [ ] Tested against the in-memory transport: fires once, never twice, never for short terms, and never at all while disabled
- [ ] UI and design work uses the `/frontend-design` skill
