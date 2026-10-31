# Non-production is the default, and unsafe capability is refused at startup

An environment is the real archive only if it says `ENVIRONMENT_MODE=production`. Everything
else — an unset value, a typo, a copied `.env`, a container started with no configuration at
all — is a practice system, and is marked as one on every page it serves.

In a practice system the application **refuses to start** if it has been handed an e-mail sender
that can reach a real person, a payment provider pointed at real mandates, or renewal reminders
switched on. The seeder refuses in the other direction: it will not write invented cars into
production.

## Why this way round

The two failures this prevents are not symmetrical.

A production system wearing a DEMO banner is embarrassing, harmless, and noticed within
seconds — by the first person who loads a page. A practice system that looks like the archive is
the failure the whole environment exists to prevent: an Editor's afternoon of marking lost
because it was never real, a board member briefed on invented data, or a test that mails a real
member a real demand for money.

So the default is the safe direction, and being production costs one deliberate line of
configuration.

## Why the capability, not the configuration string

The refusal reads `emailSender.reachesRealPeople` and `paymentProvider.reachesRealMandates` —
what the assembled edge says about itself — rather than the name of the transport or provider
that produced it. A list of forbidden strings has to be maintained by whoever adds the next
transport, and the person adding SMTP at ticket 14 is exactly the person who will not think of
it. A capability that must be declared to compile is covered before it is written.

The same holds for payment keys: "the keys here are test-mode" is not a rule an operator can be
asked to remember. At ticket 18 `reachesRealMandates` is read off the key itself — a live key
says `true` — and a practice system handed one will not start.

## The environment is in the document, not behind a request

Which environment this is arrives stamped on the `<html>` element by whatever served the page,
alongside `DEMO` in the `<title>`. It is not fetched from `/api/status` afterwards.

A member deciding whether to trust what they are reading should not have to wait for a request
to find out it is practice data; the banner must not flash into existence after first paint; and
a practice system whose database is unreachable must still say what it is. The pre-paint script
applies the same default as everything else — an unmarked document is treated as practice — so a
static host that has not been taught to stamp gets marked rather than trusted.

## Consequences

- `ENVIRONMENT_MODE` is set explicitly, per environment, and is the only place production is
  declared. Nothing derives it from `NODE_ENV`, a hostname or a branch.
- Every new external edge declares whether it can reach a real person or real money. That is a
  compile-time obligation on the interface, not a convention.
- The refusals run where the application is assembled, so every way of starting it passes
  through them. **A new entry point that does not build the app — the reminder run at ticket 17,
  a maintenance CLI — must call `assertSafeForEnvironment` itself**, or it is a way into the
  environment that nothing checked.
- Seeding demands a *declared* mode rather than the default. Choosing how to behave in silence
  should take the cautious answer; emptying tables in silence should not happen at all.
- Reminders (ticket 17) and Stripe (ticket 18) inherit the refusals without adding their own.
- The two systems are one image and one configuration file apart, which is what makes
  "deployed alongside production" (ticket 14) configuration rather than rework.

## Amended: Proposals, the first capability that exists only off Production

Decided on 2026-10-31. Until now every refusal ran one way: a practice system refuses what could
reach a real person or real money. **Proposals run the other way.** A Proposal is worked out in a
conversation with Claude on Integration (or Development), and Production **refuses to start**
when it is handed the conversation's credential, `PROPOSALS_ANTHROPIC_API_KEY`. The refusal sits
in `assertSafeForEnvironment` with the others, so every way of starting the application passes
through it.

**Why a refusal and not a switch.** A flag that hides the Propose button can be flipped by
whoever edits the environment next. Production's members never see the conversation, the Club's
processor records do not name it for Production, and its key is billed to a workspace kept for
developing Ricambi. Refusing the credential makes all three true by construction: without the
key there is nothing to show, and with it there is no Production.

**A subscription stays on the developer's machine.** In Development the conversation may run on
the developer's own Claude subscription instead of the key. Integration must never do so, since
anybody using it there would be using one person's account. Integration and Development are both
`non-production`, and this ADR forbids telling them apart by hostname or name, so the line is
drawn by the credential's form instead: the subscription method accepts **only the Claude Code
login already present on the machine** and refuses a token handed in through the environment. A
server container has no signed-in Claude Code; a developer's machine has one. Catalog reading
accepts `CLAUDE_CODE_OAUTH_TOKEN` precisely so it can run on a server, which is what Proposals
must not.

### Considered

- **A third mode, `ENVIRONMENT_MODE=development`.** Every refusal here would have to learn a
  value it has no use for, to serve one feature.
- **Leaving the subscription token out of Integration's environment by discipline.** That is
  the "rule an operator can be asked to remember" this ADR exists to avoid.
