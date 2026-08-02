# 02 — Non-production environment

**What to build:** An internal system where Editors can practise and the board can review, which
nobody could mistake for the real archive — and which is structurally incapable of e-mailing a
member or touching a real payment mandate.

Built early on purpose. The most common way a club leaks its own roster is a demo environment
loaded from production, and the most embarrassing failure available is a test system sending a
real member a real demand for money.

**Blocked by:** 01 — App skeleton with both test seams.

**Status:** done

- [ ] A non-production environment deployed alongside production, behind the same sign-in gate — **carried by ticket 14**, which now lists it. The environment itself is built and runs with one command; there is no production to stand it beside and no sign-in gate until 14, and standing it up there is a second set of variables rather than a second set of decisions. Left unchecked on purpose: nothing is deployed, and a ticked box would say otherwise.
- [x] Permanent, non-dismissible banner on every page identifying it as not the real archive
- [x] Visibly different colour scheme from production
- [x] `DEMO` in the document title, so a browser tab is identifiable at a glance
- [x] `noindex` on every page
- [x] Seed data is **generated**, never copied from production
- [x] Outbound e-mail is disabled or captured to a mailbox no member can reach
- [x] Reminder sending is disabled in this environment and cannot be enabled by accident
- [x] Payment provider keys are test-mode and structurally incapable of reaching a real mandate
- [x] A written check confirms no production data of any kind is present
- [x] UI and design work uses the `/frontend-design` skill

## Comments

**Delivered.** `pnpm demo` runs it: the built app served by the API on its own port, with its own
database, its own generated catalog, a banner on every page, warm chrome, and `DEMO` in the tab.
The reasoning is [ADR 0012](../../../docs/adr/0012-non-production-is-the-default.md); how it is
run and checked is
[`docs/operations/non-production-environment.md`](../../../docs/operations/non-production-environment.md).

**The first box is left unticked, and handed to ticket 14.** There is no deployment until 14 and
no sign-in gate until 14 and 15 — ticket 01 settled that tickets 01–12 run on a laptop, and this
ticket was pulled forward precisely so that the safety exists *before* there is anything to be
unsafe with. What is delivered is the environment itself, complete and runnable, plus the
property that makes deploying it cheap: the two systems are one image and one set of environment
variables apart. Ticket 14's checklist now carries the line — a host, a place behind the gate, a
generated roster, and this ticket's written check before anyone is shown it. The box stays
unticked here because nothing is deployed, and the status is `done` because nothing on it is
waiting for anyone: the one open box is not this ticket's to close.

**The default is the safe direction, and that is the load-bearing decision.** An environment is
the real archive only if it says `ENVIRONMENT_MODE=production`. An unset value, a copied `.env`,
a container started with nothing — all practice, all banner. A production system wearing a DEMO
banner is embarrassing and noticed in seconds; a practice system passing for the archive is the
failure this ticket exists to prevent. Being production costs one deliberate line.

**"Structurally incapable" is enforced by refusing to start.** A non-production environment that
has been handed an e-mail sender which can reach a real person, a payment provider pointed at
real mandates, or reminders switched on, does not boot — it fails loudly with the reason and the
variable to change. The check reads a *capability the edge declares about itself*
(`reachesRealPeople`, `reachesRealMandates`) rather than the name of the transport that produced
it, so the person adding SMTP at ticket 14 or Stripe at ticket 18 is covered without having to
remember this file exists. It is a compile-time obligation on both interfaces. The seeder refuses
in the other direction: generated cars cannot be written into production.

`REMINDERS_ENABLED` is back, and read. Ticket 01's review deleted it as an unused flag and said
it belonged to tickets 02 and 17; this is 02, and the guard is what reads it.

**The environment is in the document, not behind a request.** `data-environment-mode` is stamped
onto `<html>` and `DEMO` into the `<title>` by whatever serves the page — the same mechanism the
theme already uses. Fetching it from `/api/status` afterwards would mean a practice system looked
exactly like the archive until a request came back, would flash the banner in after first paint,
and would say nothing at all when the database was down. `/api/status` reports the mode too, for
whoever is looking at the machine rather than at the page.

**The mark is a proof stamp.** Everything in this archive is printed matter, and a proof sheet is
a print that is explicitly not the finished one, hatched along its edge so nobody files it as the
real thing. The band is the same orange in light and dark, because it is printed *on* the archive
rather than part of it; its hue is one the Club uses nowhere, which is the point. The surfaces go
warm with it, so no screenshot of any part of any screen can pass for production — but **only
hue and chroma move, every lightness is production's exactly**, so every contrast ratio measured
for production still holds and no token had to be re-argued. The banner carries no control of any
kind: there is nothing to dismiss and nothing to remember having dismissed. It travels with the
header, because a mark you can scroll away from is a mark you can forget.

On a phone the first draft took three lines and a fifth of the screen; it is one flowing
sentence now, and two lines.

**`noindex` is unconditional.** The markup already carried it; `X-Robots-Tag: noindex, nofollow`
is now on every response in every environment. A members-only archive is not for a search engine
in any of its incarnations, so making it a property of the demo would have been the weaker rule.

**Seed data is generated because there is no other path.** The generated catalog is written down
in `apps/api/scripts/seed.ts`. Nothing is exported, copied or anonymised from anywhere real —
there is no dump to import because there is no importer — and the script lives outside `src`, so
it is not in the production image at all. The browser seam and the practice system now share it,
which also removes the duplicate seeder ticket 01 left behind.

The seeder demands a **declared** `ENVIRONMENT_MODE=non-production`, where every other guard here
is content with the default. That asymmetry is the review's doing and it is right: choosing how
to behave when nobody has said anything should take the cautious answer, but emptying a table on
the strength of nobody having said anything should not happen at all. Seeding truncates first,
and the place it is most likely to be run — a checkout, with `DATABASE_URL` pointed wherever it
was last pointed — is exactly where the variable is most likely to be missing.

**Tests.** Both existing seams, no new ones. At the API seam: the mode is reported; the
application refuses to start with a delivering sender, with a live-mandate provider, and with
reminders on; production is allowed all three, because the refusals are about the mode and
nothing else; the served document carries the marker and the DEMO title in non-production and
neither in production; every response refuses indexing. At the browser seam: the banner is on the
catalog and on a deep link, survives a reload, offers nothing to dismiss, stays on screen when
the page is scrolled, the tab says DEMO, and the chrome is not the Club's colour.

The startup refusals are tested by trying to start the application rather than by driving a
request, because starting is the only moment they happen — an environment that could mail the
membership never gets as far as answering anything.

## Review

`/code-review` was run across both axes. What it found, and what was done:

**The seeder's guard defaulted the wrong way.** It refused only an environment that had declared
itself production — but `ENVIRONMENT_MODE` defaults to `non-production`, so a checkout with the
variable unset and `DATABASE_URL` pointed at the archive would have truncated it. Fixed as
described above: seeding now demands the declaration. The browser seam declares it too, which is
honest — it is a practice system and now says so.

**The client-side fallback marked the page but not the tab.** `theme.js` stamps an unmarked
document as practice, so the banner and the warm chrome appeared under `vite dev`, but nothing
prefixed the title — the one case where the page said DEMO and the tab did not. One line.

**The colour claim was stated more absolutely than the code.** "Only hue and chroma move, every
lightness is production's exactly" is true of the dark theme and of `surface-sunken`, which is
now exact, but not of the light theme's `surface` and `surface-raised`: paper already sits at the
top of the lightness scale, and white cannot be warm. They drop 0.007 and 0.012 — the least that
leaves them in gamut — and both were re-measured. The claim now says so, in all four places it
appears.

**The banner was set in the two smallest steps of the type scale**, against "legible at arm's
length on a phone" — the one element that is not allowed to recede. Up a step each. The hatch
was at 2.65:1 where the visual language asks non-text marks to clear 3:1; it is 3.26:1 now.

**A new entry point could bypass the refusals.** They run inside `createApp`, so every way of
starting the application passes through them — but ticket 17's reminder run might not build an
app at all. Recorded in ADR 0012 and beside the flag itself: a new entry point owes
`assertSafeForEnvironment` a call.

**Also fixed:** a comment in the status strip still claimed the banner hangs off what it reports,
which was true of the plan and not of the code; `DEMO_ENVIRONMENT_NAME` was undocumented in
`.env.example`; and "cars" had crept into code comments where `CONTEXT.md` says Model.

**Answered rather than changed.** `X-Robots-Tag` is unconditional, where the spec scopes
`noindex` to the non-production system. Deliberate: a members-only archive is not for a search
engine in any of its incarnations, and making it a demo-only property would have been the weaker
rule. And the payment box is honest but thin — there are no keys to be test-mode yet, so what
exists is the interface obligation and the refusal that reads it. Ticket 18 supplies the key and
must derive `reachesRealMandates` from it.

**One defect fixed in passing, from ticket 01's palette.** Dark `text-faint` cleared 4.5:1
against the page but only 4.20 against `surface-raised`, which is where it is actually used —
the status strip in the footer. Lifted to 0.645. The rule it breaks is one the visual language
states, so the fix went in with the arithmetic that found it: measure a token against the surface
it sits on, not against the page.
