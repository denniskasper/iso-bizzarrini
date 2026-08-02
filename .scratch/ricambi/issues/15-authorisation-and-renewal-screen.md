# 15 — Authorisation and the renewal screen

**What to build:** The archive becomes genuinely members-only. A lapsed member signs in
successfully and is told plainly what has happened and exactly how to fix it — rather than
bouncing off a sign-in error and telephoning someone.

Authenticate first, then authorise. Because they have proved who they are, we can be completely
plain without disclosing anything to anyone else.

**Blocked by:** 03 — Model, Tavola, scan ingest and private tiles; 14 — Accounts, Memberships,
roster and invitations.

**Status:** ready-for-agent

- [ ] A live Membership is checked **on every request**, not only at sign-in
- [ ] A member whose Membership lapses mid-session is on the renewal screen at the next request
- [ ] A lapsed member **authenticates successfully** and lands on a renewal screen carrying the expiry date, the amount, the Club's bank details, the payment reference and who to contact
- [ ] Recording a payment restores access with no account surgery whatsoever
- [ ] Tile and photograph requests are refused the instant a Membership lapses
- [ ] A deep link to a Position survives the sign-in redirect and opens the intended Position afterwards
- [ ] A lapsed member keeps their password, their Account and their published Contributions
- [ ] The hard-coded administrator login from the early milestones is removed
- [ ] Editor and Administrator capabilities are enforced server-side, not merely hidden in the interface
- [ ] Playwright coverage: sign in, sign out, lapsed member reaching the renewal screen, and a deep link surviving sign-in
- [ ] UI and design work uses the `/frontend-design` skill
