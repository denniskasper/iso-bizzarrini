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
- [ ] Content comes from the Club row: amount, account holder, IBAN, BIC, payment reference, deadline — editable without a deployment
- [ ] The reminder is sent **in the platform's name**, not the Club's — confirmed with the customer
- [ ] Driven by the injected clock, so the window, term boundaries and the once-only rule are all testable
- [ ] Tested against the in-memory transport: fires once, never twice, never for short terms, and never at all while disabled
- [ ] A **manual trigger** exists so an Administrator can run the job on demand rather than waiting for the nightly schedule
- [ ] In development, outbound mail is captured somewhere inspectable, so reminder content can be checked without sending

## Treasurer digest

The customer was asked directly whether the treasurer should receive an overview of expiring
memberships and answered **yes**. It is the same job and the same data as the member reminder,
so it belongs here rather than in a ticket of its own.

- [ ] The treasurer receives a periodic digest of memberships expiring soon and recently lapsed
- [ ] The digest names the members, their Paid-through dates and the payment reference to expect, so incoming transfers can be matched
- [ ] The treasurer's address is a Club setting, editable without a deployment
- [ ] The digest is covered by the same enable switch and preview as member reminders — it must not fire from unverified data either
- [ ] An equivalent view exists in the interface, so the treasurer is not dependent on an e-mail arriving
- [ ] UI and design work uses the `/frontend-design` skill
