# Membership payment and auto-renewal are in scope

The original specification listed "paying the membership fee through the platform" under
*deliberately left for later*. That deferral is overridden: the platform collects the Club's
membership dues, with recurring auto-renewal, through Stripe Billing — SEPA Direct Debit as
the primary method and cards as the fallback for members outside the SEPA area.

The Club, not the platform, is merchant of record: the payment contract, the bank account and
the liability are the association's. **Manual recording remains a first-class path** — some
members will always pay by transfer and must not be locked out — and the platform holds the
authoritative Paid-through date either way, so there is one source of truth rather than two.

## Consequences

Paid-through moves on **confirmed** payment only, never on initiation, because SEPA debits can
fail days later; access is therefore never clawed back. Auto-renewal must be cancellable in one
click. Outside the code, and required before go-live: a payment contract in the association's
name, tax advice on the VAT treatment of membership dues, the statutory online-cancellation
route, and a processor agreement with the payment provider.

## As built (issue #4)

**Stripe is behind an edge, and the edge speaks the archive's language.** Checkout is Stripe's
hosted page in subscription mode, so card numbers, mandates and strong customer authentication
are never this application's code. The adapter talks to Stripe's HTTP API directly rather than
through its SDK — three requests and one HMAC — and turns Stripe's events into the archive's
own before anything else sees them.

**A term is a year, added the way an Administrator would add it**: to the end of a term still
running, or from the day the money arrived where it had run out. The fee is the Club's own, read
from the Club's screen when a subscription starts; changing it does not reprice subscriptions
already running.

**Idempotency is two rules, not one.** Each delivery is recorded by Stripe's event id in the
same transaction as what it did, and each payment can buy only one term whatever event reports
it.

**Not built, deliberately.** The receipt is Stripe's hosted invoice — fetched each time a
member asks, since its links expire — until the association's auditors have said what they
need, and there is no year-end export. There is no grace period
around a renewal whose debit is still being confirmed; see `docs/operations/payments.md`.

