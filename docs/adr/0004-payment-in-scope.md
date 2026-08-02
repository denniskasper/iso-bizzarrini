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
