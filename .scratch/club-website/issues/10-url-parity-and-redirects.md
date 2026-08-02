# 10 — URL parity and redirects

**What to build:** Every address the old site answered on still works. Someone following an
eleven-year-old bookmark, a link in a forum post, or a search result lands on the right page
rather than a 404.

**Blocked by:** 04 — URL inventory; 05 — Astro skeleton; 08 — Remaining pages.

**Status:** ready-for-agent

- [ ] Every URL in the inventory from ticket 04 either resolves to a page or returns a permanent redirect to the page that replaced it
- [ ] Redirects are permanent (301), so search engines transfer rather than duplicate
- [ ] Redirect rules live in version control alongside the site
- [ ] An automated check runs the whole inventory against the built site and fails on any unresolved URL
- [ ] Trailing-slash and case behaviour is consistent and does not produce duplicate addresses
- [ ] Directly-linked media (images, PDFs) is covered, not only pages
- [ ] A link check over the built site passes with no broken internal links
- [ ] Any URL deliberately retired is listed explicitly, with the decision recorded — silent removal is not acceptable
