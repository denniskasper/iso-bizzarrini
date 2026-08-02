# 05 — Astro skeleton, Home page, deploy on push

**What to build:** The Club's Home page, rebuilt, live on the new host. A developer pushes a
change and it appears. This is the tracer bullet for the whole site: content → build → deploy →
served, with the test seam that every later page will be checked by.

**Blocked by:** 04 — Archive the old site; 01 — VPS, Caddy and DNS.

**Status:** ready-for-agent

- [ ] Astro project producing static output; no server, no database, no runtime
- [ ] Shared layout with the site's navigation and footer
- [ ] Home page rebuilt with the real content and images from the archived mirror
- [ ] UI and design work uses the `/frontend-design` skill
- [ ] Fonts are **self-hosted** — no request to a third-party font service from any page
- [ ] No analytics, no tracking, no third-party embeds; consequently no cookie banner
- [ ] CI builds on push and deploys the output to the VPS; no build tooling runs on the VPS
- [ ] Caddy serves the built site on the club hostname
- [ ] Built-output test seam established, asserting: the page renders its expected content, no request leaves the origin, and no cookies are set
- [ ] Site is legible and usable on a phone
