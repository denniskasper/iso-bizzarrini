# 15 — Authorisation and the renewal screen

**What to build:** The archive becomes genuinely members-only. A lapsed member signs in
successfully and is told plainly what has happened and exactly how to fix it — rather than
bouncing off a sign-in error and telephoning someone.

Authenticate first, then authorise. Because they have proved who they are, we can be completely
plain without disclosing anything to anyone else.

**Blocked by:** 03 — Model, Tavola, scan ingest and private tiles; 14 — Accounts, Memberships,
roster and invitations.

**Status:** done

- [x] A live Membership is checked **on every request**, not only at sign-in
- [x] A member whose Membership lapses mid-session is on the renewal screen at the next request
- [x] A lapsed member **authenticates successfully** and lands on a renewal screen carrying the expiry date, the amount, the Club's bank details, the payment reference and who to contact
- [x] Recording a payment restores access with no account surgery whatsoever
- [x] Tile and photograph requests are refused the instant a Membership lapses
- [x] A deep link to a Position survives the sign-in redirect and opens the intended Position afterwards
- [x] A lapsed member keeps their password, their Account and their published Contributions
- [x] The hard-coded administrator login from the early milestones is removed
- [x] Editor and Administrator capabilities are enforced server-side, not merely hidden in the interface
- [x] Playwright coverage: sign in, sign out, lapsed member reaching the renewal screen, and a deep link surviving sign-in
- [x] UI and design work uses the `/frontend-design` skill

## Comments

**Delivered.** 430 tests at the API seam (up from 411) and 214 in the browser.

**The shared passphrase is gone, and with it every `account === null` branch.** It was not only a
credential to delete: it was a second *kind* of session, and every place that asked "is there a
person behind this request" had to carry a null case that meant "yes, but nobody in particular".
`SignedIn.account` is now always somebody, `SessionClaim.accountId` is always an id, and
`SessionResponse` is a discriminated pair rather than a boolean beside a nullable field — so a
screen holding `signedIn` is holding the Account rather than one it still has to check.

**What replaces it is a command, and the command is now tested.** `roster:invite-administrator`
was the bootstrap ticket 14 introduced; removing the passphrase makes it the **only** door into a
system with an empty roster, so its substance moved out of a script and into
`composition/first-administrator.ts` where `first-administrator.test.ts` can drive it. A bootstrap
nothing exercises is one discovered to be broken by the person who cannot get in.

**The whole API suite now runs on real accounts.** `app.editor()` handed out a passphrase session
treated as an Administrator; what replaced it is `givenAnEditor`, which bootstraps an
Administrator, adds an **Editor** through the roster screen's own route and signs in as them. That
is deliberately the narrower role: almost every test here is about a screen an Editor works on, and
running them all as an Administrator would leave the difference between the two roles untested by
everything except the tests that are about the difference. The suite costs about twelve seconds
more and every request in it now goes through the real gate.

**Proving the surface is a walk over the router, not a list.** `authorisation.test.ts` reads the 60
addresses off the router the application actually built and asks each of them, as a stranger, as a
Member, as an Editor and as a lapsed member. A route added next year is covered the moment it is
added; a route that quietly falls outside the gate fails the file. It insists on finding more than
forty addresses and on exactly one mounted router, so a walk that broke would fail rather than
silently assert nothing.

## The renewal screen

**`GET /api/renewal` rather than widening `GET /api/club`**, which is the decision ticket 14 left
here. The Club's record is the association's — the reminder text, the reference *format*, the
screen that edits them — and a member does not need it. What a member needs is the amount, where
to send it, what to write on it and who to ask, so that is what the address carries, behind
`requireSignedIn` and deliberately not behind a live Membership: the person who needs it is exactly
the person the archive is refusing.

**The reference arrives written out.** The Club's format is `Ricambi {year} {name}`, and asking
somebody standing in a garage to substitute their own name into a template is asking for a transfer
the treasurer cannot match to anybody. So the API renders it — the member's own name, and the year
they are paying for: the year they are standing in if they have lapsed, the year after their term
if they are renewing early. That last part is a guess, and it is one a human reads off a bank
statement anyway; nothing here has started parsing what a member actually typed.

**One new Club field: the office e-mail.** "Contact the Club office" is advice nobody can act on
without somewhere to act on it. It is the one field on the Club's record a member ever sees, it is
editable on the Club screen like everything else there (story 130), and a Club that has published
none gets the sentence without the control — inventing an address would be worse than saying who
to ask.

**The Paid-through is on the session and not on the renewal**, because the same date served from
two addresses is two dates free to disagree. The renewal needs it only to work out the year, and
that leaves in the reference.

## Review

`/code-review` was run across both axes. What it found, and what was done:

**Two real defects on the screen.** An unconfigured Club showed a member "What renewing costs —
0.00 EUR" directly above "the Club has not published its bank details" — the fee reads `0.00`
precisely *because* nobody has configured it, so the amount and the bank details are one state
rather than two and now appear together or not at all. And the office e-mail was an address
underlined inside a sentence, 22px tall: this archive's own rule is that nothing interactive is
under 44px, and it is now a control at full height with the address as its label.

**One in the API.** Signing in wrote the session cookie *before* checking that the Account was
still there, so the 401 for an Account deleted between two queries went home carrying a valid
cookie — a credential the archive would then refuse for ninety days. It reads first now.

**And one thing this ticket had weakened without noticing.** The preview stack could not be opened
at all once the passphrase went, so it gained `EMAIL_TRANSPORT=log` — which is how an operator
reads an invitation link back out of a container. That quietly removed the property that made the
stack unpromotable: the refusal that used to stop `ENVIRONMENT_MODE=production` was the one about
the passphrase. So production now refuses `EMAIL_TRANSPORT=log` outright, which restores the
guarantee where ADR 0012 says refusals belong, and is true on its own merits — a link no member
ever receives, left in a log file that gets read, shipped and backed up. `none` is left alone: it
refuses to send, and it refuses out loud.

**Two terms went into `CONTEXT.md`** — **Renewal** and **Club office** — because both are now in
code and in what a member reads, and *Club office* sits one word from *club officer*, which is on
the Administrator's Avoid list.

## Known and left

- **Story 29** — "see when my Membership runs to" — is answered only once somebody has lapsed.
  `/api/renewal` is readable by a paid-up member and the session carries the date, so the screen
  that shows it to somebody in good standing is a small job; it is not a box on this ticket.
- **"Published Contributions"** in the seventh box is vacuous until ticket 19 builds them. What is
  proved is the half that exists: a lapsed member signs in from a fresh browser with the password
  they chose, and their Account is exactly as it was.
- Dates are still compared in UTC throughout, as ticket 14 recorded.
