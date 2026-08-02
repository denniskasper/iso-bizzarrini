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

## The hosting bundle contains more than the website

**Cancelling the hosting package without preparation takes the Club's domain and e-mail down
with it.** The domain registration and the mailboxes live inside the same bundle as the
WordPress. This is the single most damaging thing that can go wrong in this project, and it is
irreversible in a way a broken web page is not.

Work in this order, and do not reorder it:

- [ ] 1. Inventory every mailbox and forwarder, and every DNS record in the zone
- [ ] 2. Detach the domain into a standalone registration with the **e.V. as the registered holder**; replicate DNS records first so there is no downtime
- [ ] 3. Re-home e-mail to a small mail package or an external provider — **never self-hosted on the VPS**
- [ ] 4. Confirm mail flows end to end, in and out, on the new arrangement before anything is cancelled
- [ ] 5. Migrate the site content (this spec) and archive the full media library — roughly 9 GB of club history
- [ ] 6. Cancel the prototype hosting, after exporting anything worth keeping as reference
- [ ] 7. **Only then** cancel the shared hosting package — checking the contractual notice period first
- [ ] Nobody cancels anything until steps 1–4 are verified by a second person
- [ ] The retirement is recorded, including the date, so the security position is auditable
