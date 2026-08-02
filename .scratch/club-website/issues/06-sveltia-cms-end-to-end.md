# 06 — Sveltia CMS editing a real page end to end

**What to build:** A Club editor opens the editing interface in a browser, changes the Home page,
presses publish, and the live site shows the change a few minutes later — without touching a
developer, a terminal or markup.

This ticket decides whether the rebuild is a solution or a slower kind of rot. A static site the
Club cannot update is the same failure in a different form.

**Blocked by:** 05 — Astro skeleton, Home page, deploy on push.

**Status:** ready-for-agent

- [ ] Sveltia CMS served as static files alongside the site; no backend, no database, no OAuth relay
- [ ] An editor authenticates with a scoped fine-grained access token
- [ ] Page content is editable with formatting, without writing markup
- [ ] Publishing produces a commit, which triggers the build and deploy from ticket 05
- [ ] A change can be previewed before it is published
- [ ] The commit history serves as the record of what changed and when, and a change can be reverted
- [ ] The interface is usable on a tablet
- [ ] An editor's access can be revoked cleanly when the role is handed on
- [ ] A real Club editor has performed an edit successfully, unaided
- [ ] Short instructions for editors exist **in German**
