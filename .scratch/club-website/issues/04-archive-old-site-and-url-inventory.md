# 04 — Archive the old site: full mirror plus URL inventory

**What to build:** Eleven years of Club content is captured before anything is switched off, and
every address the site currently answers on is written down. Once the WordPress database is gone,
this mirror is the only copy of anything the migration overlooks — and the URL list is both the
redirect map and the test fixture that protects inbound links and search results.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] A complete static mirror of the existing site is captured: every page, image, PDF and attachment
- [ ] The mirror is browsable offline and is stored somewhere durable, not on the machine being replaced
- [ ] Every URL the site currently serves is harvested into a machine-readable inventory
- [ ] The inventory includes pages, news and event items, category and tag listings, and directly-linked media
- [ ] The size and file count of the uploads directory is recorded, since it decides whether "migrate only what is used" is a rule of thumb or a page-by-page judgement
- [ ] The premium theme's licence status is recorded — not to keep using it, but because it may be the only reference for how a page is meant to look once the shortcodes stop rendering
- [ ] Nothing on the live site is changed by this work
