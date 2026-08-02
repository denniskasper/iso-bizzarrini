# 18 — Stripe subscriptions

**What to build:** A member pays their fee through the platform and their access is restored
immediately; next year it renews itself. The Club is merchant of record — the platform is
collecting the association's dues on its behalf.

**Blocked by:** 15 — Authorisation and the renewal screen.

**Status:** ready-for-agent

- [ ] Stripe Billing with **SEPA Direct Debit as the primary method** and cards as fallback for members outside the SEPA area
- [ ] Provider-managed subscriptions, so retries, dunning, strong customer authentication and mandate storage are not our code
- [ ] Paid-through advances **only on a confirmed-payment webhook** — never on initiation. A SEPA debit that fails days later must never require access to be clawed back
- [ ] A failed payment changes nothing; the existing Paid-through stands while the provider retries
- [ ] Webhook handling is **idempotent** under redelivery and **signature-verified**; unsigned or replayed events are rejected
- [ ] Auto-renewal is stated plainly at the point of payment, before the member commits
- [ ] **One-click cancellation**, reachable without a login maze
- [ ] Cancelling leaves access running to the date already paid for, rather than cutting it
- [ ] The member can see when their Membership runs to, and whether it will renew
- [ ] A receipt is available to the member
- [ ] **Manual recording by an Administrator remains fully supported** — members who will not sign a mandate must never be locked out
- [ ] Keys are per-environment; the non-production system cannot reach a real mandate
- [ ] Tested by driving webhook payloads directly against a faked provider edge
- [ ] Recorded as required before go-live and **not** code: payment contract in the association's name, tax advice on the VAT treatment of membership dues, the statutory online cancellation route, and a processor agreement
- [ ] UI and design work uses the `/frontend-design` skill
