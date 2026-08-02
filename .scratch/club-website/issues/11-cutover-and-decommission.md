# 11 — Cutover and decommission

**What to build:** The new site becomes the Club's live site, and the WordPress installation is
switched off for good — retiring the unpatched PHP and page-builder plugin that must not share a
machine with the member roster.

Both sites can run in parallel until this point; DNS decides which is live, so the cutover is
reversible right up to the moment WordPress is destroyed.

**Blocked by:** 02 — Offsite backups; 07 — News and Events; 09 — Contact form; 10 — URL parity.

**Status:** ready-for-agent

- [ ] The URL inventory check passes against the new site in its final state
- [ ] The archived mirror from ticket 04 is confirmed complete and stored durably, off the machine being retired
- [ ] A Club editor has confirmed the content reads correctly, in German
- [ ] The contact form has been tested end to end against the real Club address
- [ ] DNS is switched, with a short TTL beforehand so it can be reversed quickly
- [ ] Certificates are valid on the club hostname after the switch
- [ ] The site is verified live: pages, images, form, legal pages, mobile
- [ ] A final export of the WordPress database and uploads is taken and archived alongside the mirror
- [ ] Only then is WordPress decommissioned, and the old hosting arrangement ended
- [ ] The retirement is recorded, including the date, so the security position is auditable
