# Taking the membership fee through the platform

How to connect Ricambi to Stripe, so that a member can pay the fee by SEPA Direct Debit or card
and have it renew itself ([ADR 0004](../adr/0004-payment-in-scope.md)). Nothing here is needed
for a system that only records bank transfers: with `PAYMENT_PROVIDER=none`, which is the
default, members are simply not offered a way to pay online.

**The Stripe account is the association's.** The Club is merchant of record: the contract, the
bank account the money lands in and the liability are its own. No key and no hostname goes into
this repository; they live in the deployment's environment.

## Before any real member pays

These are not code, and payments must not go live without them:

- [ ] A Stripe account in the association's name, with SEPA Direct Debit activated
- [ ] Tax advice on the VAT treatment of membership dues
- [ ] The statutory online cancellation route checked against what the Membership page offers
- [ ] A processor agreement with Stripe, and Stripe named as the payment Processor on the
      Club's screen so the privacy statement lists it
- [ ] The treasurer's answer on what the auditors need from a payment confirmation. Until then
      a member's receipt is Stripe's own hosted invoice, and there is no year-end export

## Setting it up

1. In Stripe, create a webhook endpoint pointing at `<PUBLIC_URL>/api/payments/webhook` and
   subscribe it to exactly these events:

   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`

2. Set three variables in the deployment's environment:

   | Variable | Value |
   | --- | --- |
   | `PAYMENT_PROVIDER` | `stripe` |
   | `STRIPE_SECRET_KEY` | the account's secret key |
   | `STRIPE_WEBHOOK_SECRET` | the endpoint's signing secret (`whsec_…`) |

   The application refuses to start with only one of the two keys.

3. Set the fee on the Club's screen. A fee of nothing means nothing is offered: a Club that has
   not said what it charges cannot collect a subscription for it.

4. Use this Stripe account for Ricambi's subscriptions only, or expect the log line below for
   every payment under a subscription Ricambi did not start.

5. In Stripe's settings, switch on its e-mails for successful payments and for upcoming SEPA
   debits. Ricambi sends none of its own about payments.

## Test keys and live keys

Whether a key is real money is read off the key itself. A key beginning `sk_test_` or
`rk_test_` is practice; **anything else is treated as live**. A non-production environment
refuses to start with a live key ([ADR 0012](../adr/0012-non-production-is-the-default.md)), so
the practice system cannot reach a real mandate however it is configured.

To rehearse the whole flow, give a non-production system test keys and pay with one of Stripe's
test bank accounts. A test SEPA debit confirms after a short delay, which is the delay a real
member will see as a few working days.

## What happens, and what does not

- **Paid-through moves only when Stripe says the money has arrived** (`invoice.paid`). Pressing
  the button, returning from Stripe's page and a debit being initiated all change nothing.
- A confirmed payment buys a year: from the end of the term the member still holds, or from the
  day the money arrived where it had already run out. The same rule the roster offers an
  Administrator recording a transfer.
- A failed payment changes nothing. Stripe retries on its own schedule; if it gives up, the
  Membership runs out on the date it was always going to.
- Cancelling stops the next collection. Access runs to the date already paid for.
- Every delivery is verified against the endpoint's secret and acted on once. A delivery whose
  signature is more than five minutes old is refused.
- Erasing a member ends their subscription at Stripe first. If Stripe cannot be reached, the
  member is not erased: an Administrator erasing them is told to try again, and the daily
  retention sweep logs it and tries again the next day.
- A payment for somebody who has already been erased is accepted, and the subscription it came
  from is ended at Stripe so that it does not collect again.
- A receipt is Stripe's own hosted invoice, fetched from Stripe each time a member asks for it.
  Ricambi stores which payment it was and never a link.

## One thing to expect at each renewal

Stripe collects the next fee a year after the first payment. A SEPA debit then takes a few
working days to confirm, and the Paid-through does not move until it does. So that a renewing
member is not shown the renewal screen for those days, **a member whose subscription is live and
renews by itself keeps reading for 14 days past their Paid-through** (`RENEWAL_GRACE_DAYS`).
Their Membership page tells them the renewal payment is being collected and until when their
access holds. On the roster they are not lapsed, and a second date beside the Paid-through,
"grace until", shows they are in grace and not paid up.

Grace changes who may read, not what was paid for. The Paid-through still moves only on a
confirmed payment. A payment confirmed in grace extends the term from the Paid-through, so the
member's year does not start late. If grace runs out without a confirmed payment, the member
lapses, and nothing is clawed back. Nobody else gets grace: a member with no subscription, one
that has ended, or one with auto-renewal off lapses on the Paid-through. Cancelling auto-renewal
during grace ends access at once, and the Membership page says so beside the button. The
retention sweep and the renewal reminders still count from the Paid-through.

## If something looks wrong

| What is seen | Where to look |
| --- | --- |
| A member paid and their date has not moved | Stripe's dashboard, under the webhook endpoint's deliveries: a failed delivery says why, and "resend" is safe to press |
| Deliveries answered 400 | The signing secret does not match the endpoint, or the server's clock is wrong by more than five minutes |
| The log says a confirmed payment "does not say whose it is" | A payment under a subscription Ricambi did not start, or one whose member could not be identified. If it is a member's fee, record it by hand on the roster |
| The log says a payment was "in a currency or amount the archive cannot record" | Money arrived that Ricambi could not turn into a term. Record it by hand on the roster |
