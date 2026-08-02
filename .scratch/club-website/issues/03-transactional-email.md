# 03 — Transactional e-mail with SPF, DKIM and DMARC

**What to build:** Mail sent by either project arrives in members' inboxes. This is load-bearing
rather than cosmetic: invitations and renewal reminders are how members get in and stay in, so
mail that lands in spam locks people out and generates phone calls to the Club.

**Blocked by:** 01 — VPS, Caddy and DNS serving both hosts over HTTPS.

**Status:** ready-for-agent

- [ ] A transactional e-mail provider is configured; mail is **never** sent from the VPS itself
- [ ] SPF, DKIM and DMARC are published for the sending domain and validate
- [ ] A test message is delivered to at least two mainstream consumer providers and lands in the inbox, not spam
- [ ] Sending credentials are per-environment, so a non-production system cannot send as the Club
- [ ] A small sending interface is exposed for both projects to use, with an in-memory transport available for tests
- [ ] Bounces and complaints are visible somewhere a human will see them
- [ ] The provider is recorded on the list of processors needing an agreement before go-live
