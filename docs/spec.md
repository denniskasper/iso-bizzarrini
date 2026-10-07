# Ricambi — members-only parts reference for Iso and Bizzarrini cars

Status: ready-for-agent

## Problem Statement

The parts knowledge for these cars exists, but nowhere anyone can reach it. Scanned factory
drawings, spreadsheets, photographs and decades of accumulated experience about what fits
what, what it is interchangeable with, and where one can still buy it sit on private machines
and in individual heads.

A member restoring a car cannot look a part up. They hold a bracket with a number stamped on
it and have no way to find out what it is, how many the car takes, which other cars used it,
or what modern component replaces it. They ask on a forum, or e-mail one person who might
know, and wait. The same question gets answered from scratch every few years, and each time
the answer is lost again.

The Club cannot control who sees its archive, so it cannot safely publish it. And the
knowledge is concentrated in a small number of ageing enthusiasts; every year some of it stops
being recoverable.

The reference sites that do exist for comparable cars show what happens without a system
behind them: every drawing's table laid out differently, dead pages, content split across two
addresses, prices with no date or source, everything dependent on one person and their inbox,
and eventually a compromised site serving injected spam. Consistency has to come from the
system, not from discipline.

## Solution

A members-only archive that reproduces how enthusiasts already navigate the factory
documentation:

**choose your car → open the exploded-view drawing → click the numbered position → read the
part.**

A **Model** has **Tavole**. A Tavola has **Positions**, each with zero or more **Marks** on
the scan. A **Listing** places a **Part** at a Position with the quantity fitted per car and
whether it is drawn there. A Part is a thing in its own right: it carries its own names,
numbers, **Fitments**, **Equivalents** and **Sources**, and the same Part appears in Listings
on many Tavole.

Members read it, and add what they know as **Contributions** that are checked before anyone
else sees them. Access comes from the Club's roster and a live **Membership**; it lapses on a
date and returns when payment is recorded, without anyone touching an account by hand.

Around 100 members. Platform language is English.

## User Stories

### Getting in

1. As a member, I want to understand from the landing page what this is and who may use it, so that I know whether to ask the Club for access.
2. As a member, I want to sign in with my e-mail address and a password, so that I use a login I already know.
3. As a member, I want to receive an invitation e-mail when the Club adds me, so that I can set my own password without anyone else ever knowing it.
4. As a member, I want the invitation link to be single-use and to expire, so that a forwarded e-mail cannot be used against me.
5. As a member, I want to be able to ask for the invitation again if I missed it, so that I am not stuck waiting for someone to notice.
6. As a member whose e-mail is not recognised, I want a plain message telling me to contact the Club office, so that I do something useful instead of assuming it is broken.
7. As a prospective member, I want the sign-in form never to reveal whether an e-mail address belongs to a member, so that the Club's roster is not readable by anyone who can type.
8. As a member whose Membership has lapsed, I want to sign in successfully and be told plainly that it expired, so that I know exactly what has happened.
9. As a lapsed member, I want the renewal screen to show the amount, the Club's bank details, the payment reference and the deadline, so that I can pay without looking anything up.
10. As a member who has just renewed, I want my access to come back by itself once the payment is recorded, so that nobody has to repair my account by hand.
11. As a member, I want a reminder e-mail before my Membership expires, so that I can pay in time.
12. As a member, I want that reminder once per membership term, not repeatedly, so that I am informed and not nagged.
13. As a member, I want to know that only paid-up members can see the archive, so that I am comfortable contributing to it.
14. As a member, I want to stay signed in for a long time, so that I am not typing a password on a phone in a cold garage.
15. As a member, I want to sign out explicitly, so that I can leave a shared computer safely.
16. As a member, I want to reset my password by e-mail, so that forgetting it does not mean asking a human.
17. As a member, I want to be told if the password I choose is one that has appeared in a known breach, so that I do not reuse a compromised password.
18. As a member, I want never to be forced to change my password on a schedule, so that I am not locked out of an archive I visit twice a year.
19. As a member, I want repeated failed sign-in attempts to be slowed down, so that my account cannot be guessed at.
20. As a member, I want my session to stop working the moment my Membership lapses, so that the rule the Club states is the rule that applies.

### Paying

21. As a member, I want to pay my membership fee through the platform, so that I do not have to make a bank transfer and wait.
22. As a member, I want to pay by SEPA Direct Debit, so that I use the method I already use for everything else.
23. As a member outside the SEPA area, I want to pay by card, so that I am not excluded.
24. As a member, I want my Membership to renew automatically, so that I never lose access by forgetting.
25. As a member, I want to be told clearly, before I pay, that this will renew automatically, so that I am not surprised in a year.
26. As a member, I want to cancel auto-renewal in one click, so that stopping is as easy as starting.
27. As a member who cancels, I want access to run to the date I have already paid for, so that I lose nothing I paid for.
28. As a member, I want my access to extend only when the payment has actually gone through, so that it is never taken away again after a failed debit.
29. As a member, I want to see when my Membership runs to, so that I know where I stand.
30. As a member who prefers a bank transfer, I want that to remain possible, so that I am not forced into a direct debit mandate.
31. As a member, I want a receipt for what I have paid, so that I have a record.

### Finding my car

32. As a member, I want to see all covered cars grouped by brand, so that I can find mine quickly.
33. As a member, I want each car shown with its model, series and model years, so that I pick the right variant.
34. As a member, I want to see all Tavole for my car listed by number with their Italian and English names, so that I can go to the right system of the car.
35. As a member, I want to filter my car's Tavole by Category, so that I can see just the brakes or just the electrics.
36. As a member, I want to see which Tavole exist for a Category across all cars, so that I can compare how the same system was built.
37. As a member, I want to see the factory's own Sezione, Gruppo and Sottogruppo for a Tavola, so that I can match it against a paper catalog.

### Working with a drawing

38. As a member, I want to see the scanned factory drawing large and legible, so that I can read it the way the factory intended.
39. As a member, I want the whole drawing to fit the screen when it opens, so that I always start with an overview.
40. As a member, I want to zoom and pan the drawing, so that I can read small position numbers on a phone in the garage.
41. As a member, I want to know where I am when I have zoomed in, so that I do not get lost in a large drawing.
42. As a member, I want to view the drawing full-screen, so that I can use every pixel on a small device.
43. As a member, I want to click a numbered circle directly on the drawing, so that I can go from what I can see to what it is called.
44. As a member, I want the Part at that Position to appear without the drawing disappearing, so that I can keep looking at both.
45. As a member, I want to see at a glance which Positions have nothing recorded yet, so that I can tell "not known" from "not yet clicked".
46. As a member, I want a list of the drawing's Parts beside it, so that I can also work from the text.
47. As a member, I want clicking a Part in that list to move the drawing to its Mark, so that I can navigate in both directions.
48. As a member, I want a Position printed in several places to take me to each of them in turn, so that I learn the part is used more than once.
49. As a member, I want to see which Positions belong to a named Sub-assembly, so that I understand which parts go together.
50. As a member, I want to type a Position number when I already know it, so that I can skip the search.
51. As a member, I want to find a Position by typing its number even when it carries a letter suffix, so that `210 S` is reachable by typing `210`.
52. As a member, I want to send another member a link that opens exactly the Position I am looking at, so that we can talk about the same thing.
53. As a member, I want such a link to still work after I sign in, so that shared links are not lost at the sign-in screen.
54. As a member, I want the drawing to stay responsive while I pan, so that using it on a phone is not painful.

### Reading a part

55. As a member, I want the Part's English and Italian names, so that I can match it against Italian factory documents.
56. As a member, I want the Catalog Number shown clearly, so that I can quote the number the catalog uses when ordering or asking.
57. As a member, I want the Disegno Origine shown, so that I can quote the original drawing number.
58. As a member, I want to be told plainly when a Part has no factory number, so that I do not go looking for one that does not exist.
59. As a member, I want to see which car, Tavola and Position I am looking at, so that I always know where I am.
60. As a member, I want to know how many are fitted per car on this drawing, so that I can order a complete set.
61. As a member, I want dimensions, material or finish, and notes, so that I know what I am dealing with before I buy.
62. As a member, I want to see what the factory catalog itself says about the Part, kept separate from what the Club has worked out, so that I can tell evidence from interpretation.
63. As a member, I want to know when a Part is not drawn on the Tavola at all, so that I do not hunt for a circle that does not exist.
64. As a member, I want the screws and washers that fasten a Part to be listed with it, so that I order the fixings as well as the bracket.
65. As a member, I want alternatives at a Position to look clearly different from additional parts at that Position, so that I do not buy one when I needed all three.
66. As a member, I want to see the other Parts at the same Position, so that I can tell early and late versions apart.
67. As a member, I want those versions distinguished by their factory number and by which cars they fit, so that I can pick the right one.
68. As a member, I want to see which other Tavole the same Part appears on, so that I learn where else it is used.
69. As a member, I want Related Positions listed, so that I can find the parts that go with this one.
70. As a member, I want a list of every Model the Part fits, with its qualification, so that I can judge cross-model compatibility myself.
71. As a member, I want fitment qualifications in the words of whoever knew them, so that half-known chassis breaks are recorded rather than lost.
72. As a member, I want Equivalents — original-equipment suppliers, other manufacturers' numbers, industry standards — so that I can buy a modern equivalent when no original exists.
73. As a member, I want to know which production car a component was also fitted to, so that I can go and find one in a scrapyard.
74. As a member, I want Sources with links, so that I know where the Part has been available.
75. As a member, I want any price shown together with where it came from and when it was seen, so that I am not misled by a stale figure.
76. As a member, I want never to see a price without its date, so that the archive cannot mislead me even by accident.
77. As a member, I want photographs of the Part, so that I can confirm visually that it is the right one.

### Searching

78. As a member, I want to search for a Part by its Catalog Number, so that I can start from the number stamped on the part in my hand.
79. As a member, I want to search by Disegno Origine, so that a number quoted in a letter or a listing is usable.
80. As a member, I want to search by an Equivalent number, so that I can find out what a modern bearing or a supplier's part replaces.
81. As a member, I want to search by English or Italian name, so that I can find something when I only know what it is called.
82. As a member, I want search results to show me which car and Tavola each Part belongs to, so that I can tell which one is mine.

### Contributing

83. As a member, I want to add what I know to a Part, so that the next person restoring this car does not have to find it out again.
84. As a member, I want to add what I know to an empty Position, so that a gap I can fill does not stay a gap.
85. As a member, I want to attach photographs to what I write, so that I can show rather than describe.
86. As a member, I want to see my own Contribution after I send it, so that I know it arrived.
87. As a member, I want to see that it is waiting to be checked, so that I do not send it again.
88. As a member, I want everything to be checked before it is published, so that the archive is not spoiled by mistakes or vandalism.
89. As a member, I want published Contributions to show who wrote them and when, so that I can judge them and follow up.
90. As a member, I want to report that a Part record is wrong, so that the archive gets better rather than drifting.
91. As a member, I want to see the Contributions others have made on a Part, so that I benefit from knowledge that has not yet been folded into the record.

### Editing the archive

92. As an Editor, I want to create a Model with its brand, model, series and years, so that its Tavole have somewhere to live.
93. As an Editor, I want to upload a scan and create a Tavola from it, so that a drawing becomes usable.
94. As an Editor, I want the scan prepared for deep zoom automatically on upload, so that I do not have to think about image formats.
95. As an Editor, I want to record a Tavola's number, Italian and English names, Category, and the factory's Sezione, Gruppo and Sottogruppo, so that it matches the paper catalog.
96. As an Editor, I want to create Positions on a Tavola before I know what any of them are, so that marking up and data entry are separate evenings' work.
97. As an Editor, I want to place a Mark by clicking the drawing, so that marking a 200-position Tavola is an afternoon and not a week.
98. As an Editor, I want to place several Marks for one Position, so that a number printed four times is clickable in all four places.
99. As an Editor, I want to move or remove a Mark I placed wrongly, so that mistakes are cheap.
100. As an Editor, I want to see which Positions on a Tavola still have no Mark and which have no Listing, so that I know what is left to do.
101. As an Editor, I want to enter a Part's names, Catalog Number, Disegno Origine, description, dimensions, material and notes, so that the record is complete.
102. As an Editor, I want to be shown the existing Part when I enter a Catalog Number that is already used, so that I merge into it instead of creating a duplicate.
103. As an Editor, I want to list an existing Part at a new Position, so that a Part used on several drawings stays one Part.
104. As an Editor, I want to set the quantity per car on each Listing separately, so that the same washer can be four here and two there.
105. As an Editor, I want to mark a Listing as undrawn, so that fasteners are recorded without pretending they are on the drawing.
106. As an Editor, I want to group Positions into a named Sub-assembly, so that members see which parts belong together.
107. As an Editor, I want to link two Positions as related, and have the link appear on both, so that I only have to record it once.
108. As an Editor, I want to record Fitments with a free-text qualifier, so that I can write "from chassis #310" without pretending to more precision than I have.
109. As an Editor, I want to record any number of Equivalents with their kind, so that nothing is lost because there were only two columns.
110. As an Editor, I want to record Sources with a price, a currency and the date it was seen, so that the price can never be shown without its date.
111. As an Editor, I want to upload photographs to a Part, so that members can identify it visually.
112. As an Editor, I want to transcribe the factory's catalog text into a field nobody will later "improve", so that the evidence survives.
113. As an Editor, I want to paste a whole Tavola's worth of rows at once, so that transcribing a catalog page is not 200 separate forms.
114. As an Editor, I want to export a Tavola's Parts to a spreadsheet, so that I can work the way I always have when I want to.
115. As an Editor, I want to see Contributions waiting to be checked, oldest first, so that nobody's submission is forgotten.
116. As an Editor, I want to see a Contribution beside the current Part record, so that I can judge it against what we already say.
117. As an Editor, I want to publish, or discard, a Contribution, so that only checked knowledge appears.
118. As an Editor, I want to correct the Part record directly while reviewing a Contribution, so that a good correction changes the archive and not just the comments.
119. As an Editor, I want to move a photograph from a Contribution onto the Part itself, so that good pictures become part of the record.
120. As an Editor, I want to promote an empty Position into a real Part from a member's Contribution, so that gaps get filled by the people who know.

### Administering

121. As an Administrator, I want to add a person to the roster with their name, e-mail and Paid-through date, so that they can be invited.
122. As an Administrator, I want to import the roster from a spreadsheet, so that an annual list does not have to be typed.
123. As an Administrator, I want the import to add and update rather than replace, so that a truncated file cannot lock out the membership.
124. As an Administrator, I want to see who has been invited, who has activated, and who has lapsed, so that "I paid, why can't I get in" is answerable.
125. As an Administrator, I want to record a payment received by bank transfer, so that members who do not pay online are not stranded.
126. As an Administrator, I want reminders to stay switched off until I turn them on, so that the first roster import cannot mail the whole membership.
127. As an Administrator, I want to preview exactly who would receive a reminder before I enable them, so that I can fix the dates first.
128. As an Administrator, I want no reminder sent for a term shorter than the reminder window, so that a backfilled membership does not receive a demand.
129. As an Administrator, I want to appoint and remove Editors, so that content responsibility can be shared and handed on.
130. As an Administrator, I want to edit the fee, bank details, payment reference format and reminder text without a deployment, so that a change of bank does not need a developer.
131. As an Administrator, I want to delete a member's personal data on request, so that the association can meet its obligations.
132. As an Administrator, I want their published Contributions to survive that deletion under "former member", so that the archive does not develop holes.
133. As an Administrator, I want accounts lapsed beyond the retention period to be deleted automatically, so that the retention rule is applied rather than remembered.
134. As anyone using a non-production system, I want it unmistakably marked as such, so that I never mistake practice data for the real archive.
135. As an Administrator, I want the non-production system to be incapable of e-mailing a real member or touching a real payment mandate, so that a test cannot embarrass the Club.

## Implementation Decisions

### Domain model

- **Model** is the only vehicle-shaped entity: brand, model, series, model years. Chassis and date breaks are **not** structured — they are a free-text qualifier on a Fitment. The member judges compatibility; the system presents.
- **Tavola** belongs to exactly one Model (ADR 0002). Its number is unique within that Model. It carries an Italian name, an English name, one **Category**, and the factory's *Sezione* / *Gruppo* / *Sottogruppo* recorded verbatim as provenance and not used for navigation.
- **Position** belongs to a Tavola and exists independently of any Part, so a Tavola can be marked up before anything is known about it. Its number is stored **as printed** — `207`, `210 S`, `211 D` — with a derived numeric sort key. Position lookup by typed number is a prefix match, so `210` finds `210 S`.
- **Mark**: zero or more per Position, each a point in fractional image coordinates (so re-scanning at a different resolution does not invalidate the work). Rendered as a fixed-radius circle. Zero Marks is legitimate and means "listed but not drawn".
- **Sub-assembly**: a named grouping of Positions within one Tavola. A Position belongs to at most one. No nesting, no number, not orderable — explicitly **not** a bill of materials.
- **Related Position**: a curated link between two Positions in the same Tavola. **Symmetric** — recording it once makes it visible from both sides.
- **Part** is identified internally (ADR 0001). **Catalog Number** optional, unique when present; entering a duplicate surfaces the existing Part and forces merge-or-correct. **Disegno Origine** optional, prominent, not unique. Both stored as opaque strings with the printed spacing preserved.
- **Part** prose fields: Name (EN), Denominazione (IT), Description, Dimensions, Material/Finish, **Catalog Note** (verbatim factory text), **Note** (club knowledge). Catalog Note and Note are distinct fields and must not be merged in the UI.
- **Listing** = Part × Tavola, with an **optional** Position, a **quantity per car**, and a **drawn/undrawn** flag. Quantity lives here, not on the Part, because one Part legitimately has different counts on different Tavole. Undrawn Listings share their parent's Position.
- Several **drawn** Listings at one Position are alternatives; **undrawn** ones are additions. The interface must make these visually distinct, since confusing them means the wrong parts arrive in the post.
- **Fitment** = Part → Model + optional free-text qualifier.
- **Equivalent** = kind (`OE Supplier` | `OEM` | `Industry Standard` | `Donor Vehicle`) + maker/standard + reference + optional note. Unbounded list; no fixed slots.
- **Source** = name + URL + optional price + currency + observed date + optional note. Price and observed date are a unit: a price is never rendered without its date.
- **Contribution** targets a Part **or** a Position; free text plus photographs; carries author and timestamp; has a review state. There is **no field-level diff or merge** — an Editor reads it and edits the record by hand (this is deliberate; see Out of Scope).

### Access and membership

- **Account** (one per person, keyed by e-mail) — **Membership** (Paid-through date) — **Club** (one row, carrying fee, bank details, payment reference format and reminder text). Access requires at least one Membership whose Paid-through has not passed. Single-club UI: no club switcher, no per-club branding.
- Roles: **Member**, **Editor** (global scope — moderates and edits every Model), **Administrator**. Club Officer is deliberately folded into Administrator while there is one Club.
- **Onboarding**: Administrator adds to the roster → single-use, expiring, re-sendable invitation e-mail → member sets their own password. "On the roster" and "has an account" are distinct states and both are visible on the roster screen.
- **Passwords** (ADR 0003): minimum 10 characters, no composition rules, checked against a breached-password range API, self-service reset by single-use link, rate-limited sign-in, ~90-day sessions with explicit sign-out. No rotation, no 2FA.
- **Sign-in is authenticate-then-authorise.** Unknown e-mail and wrong password produce the *same* generic failure, with standing guidance to contact the Club office. A lapsed member **authenticates successfully** and is routed to a renewal screen carrying amount, bank details, reference and deadline. Membership is re-checked **on every request**, so expiry takes effect immediately, including mid-session.
- **Reminders**: at most one per membership term, 30 days before Paid-through, recorded on the Membership so a re-run or restore cannot double-send. **Disabled by default and per environment**; an Administrator enables them after previewing the recipient list. Terms shorter than the reminder window get none.
- **Payment** (ADR 0004): Stripe Billing, SEPA Direct Debit primary, cards fallback, provider-managed subscriptions so retries, dunning, SCA and mandates are not our code. Paid-through advances **only** on a confirmed-payment webhook; failures do nothing and the existing date stands. Webhook handling is idempotent and signature-verified. One-click cancellation; cancelling leaves access running to the paid-for date. Manual recording by an Administrator remains fully supported.

### Visual design

- **All UI work goes through the `/frontend-design` skill.** This is a standing project rule, recorded in `AGENTS.md`.
- The direction is **the Club's own identity, rendered with Apple's restraint and Google's plainness.** Colour, typography and logo treatment are lifted from the Club website so the two properties read as one organisation — captured before the old site is retired.
- **From Apple**: the drawing is the hero and the interface recedes around it. Generous whitespace, large confident type, a restrained palette with very few accents, chrome that stays out of the artwork's way.
- **From Google**: the tools are plain and unambiguous. One dominant action per screen, high-contrast legible type, dense information presented calmly, no decoration on anything functional. The search field and the position-number entry are the clearest examples — they should look like tools, not features.
- **Design tokens defined once** — colour, type scale, spacing, radii — and consumed by every component. No ad-hoc values in feature code.
- Light and dark handled from the start. A scan is black lines on white paper, so dark surrounding chrome is a hypothesis worth testing early: it makes the drawing the brightest thing on screen.
- **Built for a garage**: high contrast in poor light, touch targets usable with cold or dirty hands, legible at arm's length on a phone. This is the actual usage context (story 40), not an accessibility afterthought.
- English throughout. The Club website is German; neither borrows the other's language.

### Application and infrastructure

- Vite + React + shadcn/ui + Tailwind, TanStack Router and Query; Express + TypeScript + Zod + Sentry (EU region, PII scrubbing); Drizzle on Postgres. One deployable (ADR 0008).
- Layered internally: routes → controllers → services → repositories. Configuration and secrets per environment; nothing environment-specific compiled in.
- **Deep zoom**: an image pyramid generated once at ingest (libvips), served as static tiles, viewed with OpenSeadragon. The viewer supplies fit-to-screen, pan/zoom, full-screen and the navigator overlay directly; its overlay API is also the mechanism by which Marks stay pinned to image coordinates at every zoom level.
- **Image access** (ADR 0006): scans, tiles and photographs are private. Caddy `forward_auth` validates session **and** live Membership before serving; tiles carry long immutable cache headers. No public bucket, no CDN.
- **Deployment** (ADR 0009): one EU VPS, Docker Compose, Caddy with automatic TLS. Ricambi on its own subdomain so the session cookie never reaches the club's public site. Postgres and all files on the box; nightly encrypted backups to a **different** provider; host snapshots are rollback, not backup.
- **Transactional e-mail** through a dedicated provider with SPF/DKIM/DMARC — never from the VPS.
- **Search**: Postgres only. Exact and prefix matching over Catalog Number, Disegno Origine, Equivalent references, Name (EN) and Denominazione (IT). No relevance ranking, no free-text search over notes or Contributions, no external search engine.
- **Data loading** (ADR 0005): initial load by versioned, re-runnable migration scripts against the existing spreadsheets and scans. The only permanent import in the product is the member roster, and it upserts — it never deletes. Editors get bulk-paste per Tavola and spreadsheet export instead of a catalog importer.
- **Time is injected**, not read from the system clock in domain code. Expiry, the reminder window, term boundaries and the retention sweep all depend on it and are otherwise untestable.
- **Retention** (ADR 0007): automatic deletion of Accounts lapsed beyond the retention period (proposed three years); published Contributions survive with the byline replaced by "former member"; payment records retained for the statutory period.
- **Environments**: production and one internal non-production system, marked with a permanent non-dismissible banner, a distinct colour, `DEMO` in the document title and `noindex`. Seed data is **generated, never copied from production**. Payment keys and reminder enablement are per-environment.

### Build order

**This project and the club website are independent.** No shared code, separate repositories,
separate deployables, separate test suites. M1 and M2 below need **no infrastructure at all** —
they run against a local Postgres on a laptop — so the two streams proceed in parallel and only
converge when Ricambi first has to be reachable by real members, at M3.

The one thing neither project can route around is the club's **domain**: it lives inside the
same hosting bundle as the club's e-mail, and nothing goes live under the club's name until
that is safely untangled (club-website tickets 04 and 11).

- **M1** — vertical slice on **a real Tavola**, not sample data: Model, Tavola, Positions, Marks, Parts, Listings; scan ingest; the marking tool; the viewer with working hotspots; the Part page. Single hard-coded admin login, running locally.
- **M2** — editor tooling at scale plus migration of the existing spreadsheets. **This is what unblocks volunteers**, and marking Tavole is the project's critical path.
- **M3** — the gate: roster, invitations, passwords, expiry, reminders, Stripe, auto-renewal. **Carries the first deployment**, since invitations cannot be sent from a laptop. Needs the VPS, the Ricambi hostname and a sending domain.
- **M4** — Contributions and moderation.
- **M5** — search, Category filters, polish.

## Testing Decisions

A good test here describes behaviour a member, Editor or Administrator would recognise, and
would still pass if the internals were rewritten. Tests assert on what comes back over HTTP
and what appears in the database, never on which service called which repository.

### Primary seam — HTTP against the real application, with a real Postgres

The bulk of the suite drives the Express app in-process against a real Postgres (containerised,
or a schema per test worker), through real HTTP requests with real session cookies. Routes,
controllers, services, Drizzle and the database all participate. **Nothing of ours is mocked.**

Only three edges are faked, each behind a narrow interface:

- **Payment provider** — tests drive webhook payloads directly. The load-bearing rules are that Paid-through advances on *confirmed* payment and never on initiation, that a failed debit changes nothing, that webhook handling is idempotent under redelivery, and that an unsigned or replayed webhook is rejected.
- **E-mail sender** — an in-memory transport tests assert against: invitations are single-use and expire, reminders fire once per membership term and never for short terms, and nothing is sent at all while reminders are disabled.
- **Clock** — injected. Expiry mid-session, the 30-day reminder window, term boundaries and the retention sweep are all driven by advancing it.

Behaviour to cover at this seam includes: a Position carrying two drawn alternatives and three
undrawn fasteners renders them as distinguishable groups; the same Part listed on two Tavole
reports different quantities; entering an existing Catalog Number is refused with a pointer to
the existing Part; a Position number with a letter suffix is found by its numeric prefix; a
Related Position link recorded once is visible from both ends; a Source with a price always
carries its observed date; unknown e-mail and wrong password produce byte-identical responses;
a lapsed member authenticates and is routed to renewal; a tile request is refused the instant a
Membership lapses; a Contribution is invisible to other members until published and shows its
byline afterwards; an erased Account's Contributions survive as "former member".

The Caddy `forward_auth` endpoint is an ordinary route at this seam and is tested like any other.

### Second seam — Playwright against the running application

Deliberately thin, and reserved for what the API seam cannot see: the drawing viewer fits to
screen on open; a Mark is clickable and lands on the correct Position at several zoom levels;
a Position printed more than once cycles through its Marks; a deep link opens the exact
Position; that link survives the sign-in redirect. Plus sign-in, sign-out and the renewal
screen end to end.

No third layer of unit tests beneath the API seam — it would couple tests to internal structure
and duplicate coverage already present.

### Prior art

None — this is a greenfield repository. These two seams are the prior art for everything that
follows, and new tests should be added at them rather than at new ones.

## Out of Scope

- **Field-level proposed edits.** Contributions are attributed prose and photographs; corrections reach the record through an Editor's hands. No diff engine, no apply/reject UI, no per-field audit trail.
- **A bill of materials.** Sub-assemblies group Positions; they are not orderable parts containing child parts.
- **Structured chassis and date ranges.** Fitment qualifiers are free text. "Every part for chassis #312" is not answerable mechanically, deliberately.
- **A permanent catalog spreadsheet importer** (ADR 0005).
- **Documents** attached to Parts — manuals, letters, scans other than Tavole. Cheapest deferral to reverse later, since photograph upload builds the same machinery.
- **Self-signup.** Membership of the association is granted under its statutes; a payment form cannot admit anyone. Joining stays off-platform; paying does not.
- **Multi-club support.** Club and Membership exist as entities, but there is no club switcher, no per-club branding and no per-club officer role while there is one Club.
- **The invented catalog numbering scheme** from the original prototype (ADR 0001), and the 4-digit category/sub-category numbers, which encoded a Model relationship now modelled properly.
- **3D views**, **service and repair articles per Tavola**, a **production register**, **reference pages** (paint, bulbs, fasteners, decals), and a **links page**.
- **The public club website** — separate spec, separate repository, separate host.
- **Free-text search** over notes and Contributions; relevance ranking; any external search engine.
- **A public CDN** in front of the tiles, and any public image path.
- **Two-factor authentication** and forced password rotation (ADR 0003).

## Further Notes

**Facts to establish before data loading begins.** The catalog row reads
`260 03 150 | 207 | ASTA GUIDA PER CRISTALLO MONTANTE | 2 | 208503`. The existing draft
spreadsheet labels the *first* column as Disegno Origine, but the conventional column order in
an Italian factory catalog would make the *last* column the Disegno Origine and the first the
catalog number. One uncropped catalog page settles it. Both fields exist either way, so if the
labels are swapped, the change is which field carries the uniqueness rule.

**Scan resolution is still completely unknown, and it decides the viewer.** The only genuine
drawing seen so far was supplied downsized at 1245 × 809; the sample tavole in the earlier
implementation of this product are artificial images and prove nothing. Deep-zoom tiling was
chosen on an assumption — A3 at 300 dpi — that nothing has verified. **Ticket 03 measures real
scans and decides**, and ADR 0006 defers to it. Marks are stored in fractional image
coordinates precisely so the decision can be reversed without re-marking anything.

**A previous implementation of this product exists**, built on Payload CMS and Postgres, and
several requirements here were recovered from it rather than invented: the treasurer digest,
the platform's own legal pages, the depth of the data-protection obligations, part condition on
a Source, camera capture when contributing, and the manual reminder trigger. Two of its
decisions we have deliberately reversed — it stored one part row per Tavola-and-Position (to
avoid deciding identity, which we have now decided), and it typed the Position number as an
integer capped at three digits, which cannot store `210 S`.

**Whether Iso and Bizzarrini numbers encode a category** in their prefixes, as Lamborghini's do,
is worth someone checking against the scans. It changes nothing structurally — numbers are
opaque strings — but a prefix decoder would be a cheap display improvement afterwards.

**The critical path is human, not technical.** Placing Marks on hundreds of Tavole is the long
pole, it cannot be automated from any existing data, and it can proceed in parallel with
everything else from M2 onwards. Optical recognition of the numbers was considered and rejected:
on 60-year-old scans of hand-drawn exploded views it produces output an Editor must check anyway,
which is slower than placing the points.

*What would justify revisiting that, and what would not.* The rejection stands, and the first
real sheet seen since supports it: the numbers are **bare numerals with leader lines, not circles**
— there is nothing for a detector to anchor on — they run in groups (`150 151 152 153`, `36 37
36`) that need segmenting, and suffixed numbers like `210 S` and `211 D.` must survive exactly as
printed. On the copy available they are 7–9 px tall, where recognition is not merely unreliable
but impossible. Two things would change the arithmetic rather than re-argue it: a **600 dpi**
original, where the same numerals are around 60 px; and a **proposal-only** shape, where what is
produced is a pre-placed Mark an Editor confirms in one press rather than a Position the archive
has written down. The claim to test then is not "is the recognition good" but "is confirming a
proposal faster than placing a point" — and until there is a full-resolution scan, that cannot be
tested at all. Nothing here is to be built on the strength of the paragraph above.

**Decisions the association's board still owns:** dropping forced password rotation; whether to
add a single expiry-day e-mail in addition to the 30-day reminder (recommended — it is a
different message rather than a repeat, and it is the one that recovers lapsed members); the
product name; and the retention period, proposed at three years.

**Required before go-live, and not code:** a payment contract in the association's name, tax
advice on the VAT treatment of membership dues, the statutory one-click online cancellation
route, processor agreements with the hosting provider, payment provider, error-tracking provider
and e-mail provider, and a privacy statement covering both this platform and the club website.
