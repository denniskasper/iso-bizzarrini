# No error-tracking vendor; errors are logged on the box

Ricambi sends unhandled errors nowhere. They are logged through pino, on the VPS, under the
association's own control. This supersedes the Sentry clause of ADR 0008; the rest of that ADR
stands.

Sentry was specified, built and tested — in the EU data region, refusing to start against a
non-EU DSN, scrubbing user, headers, cookies, body and query string before any event left. It
was removed anyway, because the thing it cost was not the code:

- **A processor agreement.** The association is the controller for its members' personal data.
  Every third party that might receive a stack trace from a members-only archive is one more
  agreement to sign, one more entry in the privacy statement, and one more relationship a
  volunteer committee has to maintain. This is a club that is removing third-party fonts from
  its website specifically to avoid a consent banner; adding an error-tracking processor cuts
  against that.
- **44 MB.** `@sentry/node` and its OpenTelemetry dependencies were the larger part of the
  runtime image, in a project whose sibling repository is being rebuilt around having nothing
  to patch.
- **It could not earn any of that back yet.** Tickets 01–13 run on a laptop, where the console
  is right there. There is no deployment until ticket 14.

## What is lost, honestly

Aggregation and alerting. Without them, an error at nine in the evening is discovered when a
member e-mails the Club office, or not at all. With around a hundred members who visit twice a
year, that is a real gap — it is a considered trade, not a claim that the gap does not exist.

## Consequences

The seam is kept. `AppDependencies.attachErrorReporting` in `apps/api/src/app.ts` is the one
place a reporter attaches — after the routes, before our error handler, so it sees the failure
and we still answer clean JSON. Nothing supplies it today.

**Reconsider at ticket 14**, which carries the first deployment and the first real members. By
then there is something to watch, and the processor agreements for hosting, e-mail and payment
are being signed anyway, so one more is a marginal cost rather than a new category of work. If
the answer is still no, an alert on logged errors from the box is the cheaper half of what a
vendor would have provided.
