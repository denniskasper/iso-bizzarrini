# Club website — retire WordPress, rebuild as a static site

Status: ready-for-agent

## Problem Statement

The Club's public website runs WordPress on a PHP release that has had no security fixes since
January 2019, with a page-builder plugin from around 2016 that is among the most exploited in
WordPress's history. Automated scanners look for exactly this combination, continuously.
Nothing has gone wrong yet; the configuration is the kind where something eventually does.

That has been a tolerable risk while the site stood alone. It stops being tolerable now, because
the site is being moved onto the same VPS as Ricambi — which holds the member roster, payment
references and session secrets. Today the two fail independently. Co-hosting removes that,
unless the website stops being the liability.

The site also carries costs that have nothing to do with security. Fonts are loaded from a
third party, which German courts have held to require consent, so a consent-banner plugin
exists to manage the consent for a dependency the site does not need. The theme is a premium
one that needs a live licence to update, so updating is a purchase decision rather than a
maintenance task. And every plugin is a thing someone must keep watching for the next decade —
watching that has demonstrably not been happening, on a site whose *content* is edited weekly.

## Solution

Retire WordPress rather than move it. Rebuild the site as static HTML with **Astro**, edited
through **Sveltia CMS** — a client-side admin backed by the Git repository, so the club keeps a
real editing interface while the running site has no server, no database, no PHP and nothing to
patch.

The site keeps its structure (Home, Über uns, Events, Presse/Markt/Infos, Kontakt), its German
language, its URLs, and its Impressum and Datenschutz. It gains self-hosted fonts and no
tracking, which means **no cookie banner is required at all**. The contact form is replaced by a
small endpoint of the Club's own, isolated from Ricambi, sending through the same transactional
e-mail provider.

It lives in **its own repository** on **its own host** (`<CLUB_DOMAIN>`), separate from Ricambi
(`ricambi.<CLUB_DOMAIN>`), served by Caddy from the same VPS.

## User Stories

### Visitors

1. As a visitor, I want to read about the Club and what it does, so that I can decide whether to join.
2. As a visitor, I want to see the Club's vehicles and merchandise, so that I get a sense of what the Club is about.
3. As a visitor, I want to see upcoming and past events, so that I know what the Club does through the year.
4. As a visitor, I want to read the Club's news and press items, so that I can follow what is happening.
5. As a visitor, I want to browse marque information on Iso and Bizzarrini, so that I can learn about the cars.
6. As a visitor, I want to see the market and parts information pages, so that I can find what is for sale or wanted.
7. As a visitor, I want links to partners and related registries, so that I can reach the wider community.
8. As a visitor, I want to contact the Club through a form, so that I can ask a question without publishing my own address.
9. As a visitor, I want to reach the Impressum and Datenschutz easily, so that I know who runs this and what happens to my data.
10. As a visitor, I want the site to work well on a phone, so that I can read it anywhere.
11. As a visitor, I want the site to load quickly, so that I am not waiting on a slow page.
12. As a visitor, I want not to be asked to accept cookies, so that I can just read the site.
13. As a visitor, I want my data not to be sent to third parties merely by loading a page, so that reading the site is not a disclosure.
14. As a visitor arriving from an old bookmark or a search result, I want the page to still be there, so that eleven years of links do not break.
15. As a prospective member, I want a page explaining the parts archive and how to get access to it, in German, so that I understand what membership includes.
16. As a member, I want a clear link from the Club site to the parts archive, so that I can get to it from the place I already know.

### Editors

17. As a Club editor, I want to sign in to an editing interface in my browser, so that I do not need any software installed.
18. As a Club editor, I want to edit page text with formatting, so that I do not have to learn markup.
19. As a Club editor, I want to add a news item, so that announcements go out without a developer.
20. As a Club editor, I want to add an event with its date and details, so that the calendar stays current.
21. As a Club editor, I want to upload images and place them in a page, so that posts can be illustrated.
22. As a Club editor, I want uploaded images converted to a modern format automatically, so that I do not have to think about file sizes.
23. As a Club editor, I want to reuse an image I uploaded earlier, so that I am not uploading the same photo repeatedly.
24. As a Club editor, I want my changes to appear on the live site shortly after I publish, so that I can see the result.
25. As a Club editor, I want to preview a change before publishing, so that I do not publish a mistake.
26. As a Club editor, I want a record of what changed and when, so that a mistake can be undone.
27. As a Club editor, I want to edit from a tablet, so that I can post from an event.
28. As a Club editor, I want my access to be revocable, so that handing the role on is clean.

### Club and operations

29. As the Club, I want the public site to have no attack surface, so that it cannot be defaced or injected with spam.
30. As the Club, I want a compromise of the website to be impossible rather than merely contained, so that the member data on the same machine is not exposed to it.
31. As the Club, I want the site to need no security patching, so that maintenance neglect stops being a risk.
32. As the Club, I want the site not to depend on a paid theme licence, so that updating is never a purchase decision.
33. As the Club, I want to keep the Club's own domain and page addresses, so that eleven years of links and search results survive.
34. As the Club, I want the old site archived in full before it is switched off, so that anything missed in the migration is recoverable.
35. As the Club, I want contact enquiries to arrive by e-mail as they do today, so that nothing about the club's inbox changes.
36. As the Club, I want enquiry data not to pass through a third party, so that the privacy statement stays simple.
37. As the Club, I want the contact form protected against spam, so that the inbox stays usable.
38. As the Club, I want the site's content in version control, so that it is backed up with the site itself.
39. As the Club, I want editors' access to the website to give them no access whatsoever to the parts archive's code, so that the two responsibilities stay separate.
40. As a developer, I want the site to build and deploy on push, so that publishing is not a manual step.
41. As a developer, I want the site served from its own host with its own certificate, so that it is isolated from the parts archive by configuration.

## Implementation Decisions

- **Retire, do not migrate** (ADR 0010). The existing WordPress is not moved onto the VPS in any form.
- **Astro**, static output. No SSR, no server, no runtime. Content as Markdown in the repository, using Astro's content collections for news and events.
- **Sveltia CMS** for editing: a client-side admin served as static files, committing to the Git repository directly. No backend and no OAuth relay — editors authenticate with a scoped fine-grained personal access token. Decap CMS is the fallback if Sveltia proves unsuitable; the configuration format is shared, so switching is cheap.
- **Media in the repository.** Sveltia converts images to WebP on upload; Astro's asset pipeline produces responsive, optimised output at build. **Only images the new site actually uses are migrated** — the archived mirror of the old site is the record of everything else. Determine the size of the existing uploads directory before starting; if it is large *and* the whole gallery history must stay online, external media storage is a configuration change in Sveltia rather than a change of plan.
- **Content is re-created, not converted.** Page layouts are stored as nested page-builder shortcodes and do not export to anything usable. Text, images and the news/events archive carry over mechanically; page structure is rebuilt. This is the slow part of the work — supplying page copy as plain text materially shrinks it.
- **URLs preserved**, or permanently redirected where a path must change. A complete list of existing URLs is taken from the old site before switch-off and each one verified against the new site.
- **A complete static mirror of the old site is archived** before WordPress is decommissioned, and retained. Once the WordPress database is gone, that mirror is the only copy of anything overlooked.
- **Self-hosted fonts, no tracking, no cookies.** This removes the third-party font dependency, the consent-management plugin and the cookie banner together. If visitor numbers are wanted later, a cookieless tool self-hosted on the same VPS keeps the banner gone.
- **Contact form**: a small, separate container that accepts the post, applies a honeypot field and rate limiting, and sends through the transactional e-mail provider already configured for Ricambi. No enquiry data leaves the Club's control; no third-party form service. Isolated from Ricambi so a fault in it cannot reach the member database.
- **Its own repository** (ADR 0010). The CMS grants write access to non-developers; that must not be the repository containing session handling, the roster or the payment integration.
- **Its own host.** `<CLUB_DOMAIN>` serves the static root; `ricambi.<CLUB_DOMAIN>` is a separate Caddy server block with its own certificate and logs. The subdomain split also scopes Ricambi's session cookie so the public site never receives it.
- **Deployment**: CI builds the Astro site on push and rsyncs the output to the VPS; Caddy serves it with automatic TLS. No build tooling on the VPS. Publishing from the CMS produces a commit, which triggers the build.
- **Impressum and Datenschutz** carry over and are updated: the privacy statement must now describe both the public site and the parts archive, including the hosting, e-mail, payment and error-tracking processors.
- **German remains the site's language**, distinct from Ricambi's English. Story 15's explanation of the parts archive is written for prospective members in German here; Ricambi carries its own English signed-out landing page for people who follow a direct link.

### Sequencing

This is **M0**, delivered together with the shared infrastructure and before Ricambi's vertical
slice: VPS in an EU region, Caddy, Docker Compose, offsite backups with a restore actually
performed, transactional e-mail with SPF/DKIM/DMARC, DNS and TLS. Doing the small, low-risk
project first retires the live security liability early and proves the shared infrastructure
before any member data exists on the machine.

## Testing Decisions

A good test here asserts on what a visitor receives, not on how the site was generated. There
is no application state, so there is nothing to test about behaviour over time — the whole
surface is the built output and one form endpoint.

### Primary seam — the built output

Run the production build and assert against the generated files:

- Every URL taken from the old site either resolves to a page or returns a permanent redirect to one. This is the test that protects eleven years of inbound links and is worth writing first, from the harvested URL list.
- Every page renders its expected content — headings, navigation, footer — and no page is empty or errors during the build.
- **No request leaves the origin**: no third-party font, script, analytics or embed appears in any generated page. This is a hard assertion, because it is what keeps the cookie banner unnecessary and the privacy statement honest.
- **No cookies are set** by any page.
- Impressum and Datenschutz exist and are reachable from every page.
- The link checker passes over the built site — no internal link is broken.
- Images are emitted in a modern format at the expected sizes, and no unoptimised original is shipped.

### Second seam — the contact form endpoint

Tested over HTTP against the running container: a well-formed submission produces exactly one
outbound message (asserted against an in-memory transport, as in Ricambi); a submission with the
honeypot filled produces none and still returns success; submissions beyond the rate limit are
rejected; and a malformed payload is rejected without sending.

### Prior art

Ricambi's suite is the reference for the e-mail-sender fake used by the form endpoint. Everything
else here is new, and the built-output seam is the prior art for any future test on this site.

## Out of Scope

- **Migrating WordPress in any form**, including a hardened or containerised installation.
- **Any dynamic public functionality** — user accounts, comments, forums, search over content, or a members' area. Members' functionality lives in Ricambi.
- **Migrating the entire uploads archive.** Only images the new site uses are carried over; the archived mirror holds the rest.
- **Redesigning the site.** This is a rebuild of the existing structure and content, not a new design. Visual improvement is a separate conversation.
- **Analytics of any kind** in the initial delivery.
- **Multilingual content.** The site stays German.
- **A third-party form service.**
- **External media storage** — deferred, and available as a configuration change if the media volume demands it.
- **Any shared code, shared repository or shared deployment pipeline with Ricambi**, beyond the VPS, Caddy and the transactional e-mail provider.

## Further Notes

**Establish before starting:** the size and file count of the existing uploads directory
(`du -sh` on the server) — it does not change the plan, but it decides whether "only what is
used" is a rule of thumb or a page-by-page judgement; and a complete harvested list of existing
URLs, which is both the redirect map and the first test.

**The theme licence.** The existing site uses a premium theme with a child theme. Its licence
status is worth knowing during the rebuild — not to keep using it, but because the licensed
copy may be the only reference for how some pages are meant to look once the shortcodes stop
rendering.

**Content editing is the risk, not the build.** A static site nobody at the Club can update
becomes a site that is not updated, which is the failure mode this rebuild is meant to prevent
in a different form. The CMS must be set up, tested with a real Club editor, and documented in
German before the old site is switched off — not afterwards.

**Timing.** The old site should not be decommissioned until the new one is verified against the
URL list and the archived mirror is confirmed complete. Until then both can run, with DNS
deciding which is live.

**The hosting bundle is not just the website — this is the project's largest single risk.** The
**domain registration** and the **Club's e-mail** live inside the same package as the WordPress.
Cancelling it without preparation takes the Club's address and its mail down, and unlike a
broken page that is not reversible in an afternoon. The safe order is set out in ticket 11:
inventory mailboxes and DNS, detach the domain into a standalone registration with the e.V. as
holder, re-home e-mail (never onto the VPS), verify mail flows both ways, migrate and archive
content, cancel the prototype hosting, and only then cancel the package — respecting its notice
period. **MX records are not to be touched** by any DNS work along the way.

**Access may not exist yet.** Earlier work on this project established that the people involved
held WordPress administrator credentials but not the hosting control panel, which is where DNS
is managed. Ticket 01 carries this as a precondition; it can stall the whole stream at step one.

**Ownership.** The hosting account should belong to the Club, with the developer invited as a
technical administrator holding console and SSH access but no billing or account access — so
either side can end the arrangement without holding the other's assets. The same principle
applies to the repository. Recorded on ticket 01.
