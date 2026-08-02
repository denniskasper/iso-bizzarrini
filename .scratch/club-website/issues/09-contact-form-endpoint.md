# 09 — Contact form endpoint

**What to build:** A visitor fills in the Kontakt form and the Club receives the enquiry by
e-mail, exactly as it does today. Nothing about the Club's inbox changes; the difference is that
no third party sees the message and there is nothing on the public site that can be exploited.

**Blocked by:** 03 — Transactional e-mail; 08 — Remaining pages.

**Status:** ready-for-agent

- [ ] A small, separate container serves the endpoint; it shares no process, storage or credentials with the parts archive
- [ ] A well-formed submission sends exactly one message to the Club's address through the provider from ticket 03
- [ ] A honeypot field silently discards bot submissions while returning the same success response
- [ ] Submissions are rate limited per source
- [ ] Malformed submissions are rejected without sending
- [ ] Enquiry contents are not stored or forwarded anywhere else — no third-party form service
- [ ] The visitor sees a clear confirmation, and a clear error if sending fails
- [ ] The form works without JavaScript where reasonably possible
- [ ] Tested over HTTP against the running container, asserting against an in-memory transport
- [ ] UI and design work uses the `/frontend-design` skill
