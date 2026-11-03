# PROTOTYPE — throwaway: a CMS demo for the Club website

Answers one question for the Club's chair: **what does editing the new Club website feel like?**
(ADR 0010: Astro + Sveltia CMS.) Not the real site, not its real content model, and never merged
to `main`. Delete it after the call.

- `site/` is served as static files. `admin/` loads Sveltia CMS from a CDN with its **Test
  backend**: no login, and every change stays in the visitor's own browser (OPFS). Nothing is
  published anywhere.
- `site/seed/` is the invented starting content, copied into the browser on "Start Demo".
- Deployed on the preview box as its own Dokploy app from this branch, with this folder's
  `Dockerfile`.
