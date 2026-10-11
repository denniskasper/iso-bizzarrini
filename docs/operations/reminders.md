# Renewal reminders and the treasurer's digest

How to turn renewal reminders on, and what to do before the first night they run (issue #3).

**The risk is the first day, not the feature.** A roster arrives with Paid-through dates nobody
has checked, some of them inside the reminder window. Switched on that night, the job would ask
those members for money on the Club's behalf, and an e-mail cannot be recalled. Everything
below is arranged so that somebody reads the list first.

## What is sent

- **A reminder** to a member, thirty days before their Membership's Paid-through: the amount,
  the account holder, the IBAN and BIC, the payment reference written out in their name, and
  the date the money has to arrive by. The opening sentence is the Club's own, from the Club's
  screen. One per membership term, recorded on the term; a renewal starts a new term and is
  owed its own a year later.
- **A digest** to the treasurer, weekly, listing members whose Membership runs out in the next
  thirty days or ran out in the last thirty, each with the reference to expect. Not sent when
  there is nobody to list, or while no treasurer's address is set.

Nobody gets a reminder if:

- their term was recorded less than thirty days before it ends — a backfilled Membership must
  not receive a demand;
- their Membership has already run out;
- they have a subscription that renews by itself.

## Three things have to be true

Nothing is sent unless all three hold. The Reminders screen says which does not.

| | Where | Who |
| --- | --- | --- |
| The environment allows it | `REMINDERS_ENABLED=true`, which only a production environment may set, **and** `EMAIL_TRANSPORT=smtp`, the transport that delivers to real inboxes | Whoever operates the server |
| Reminders are switched on | The Reminders screen | An Administrator |
| The Club can be paid | A fee and an IBAN on the Club's screen | An Administrator |

A non-production system refuses to start with `REMINDERS_ENABLED=true`
([ADR 0012](../adr/0012-non-production-is-the-default.md)). Its Reminders screen still shows
who *would* be written to and the letter they would get, which is how the wording is checked
without sending anything.

## Before the first night

1. Load or type the roster, and correct the dates on it.
2. Open **Roster → Reminders**. Read "would be written to tonight" and "in the next 30 days"
   name by name. Anybody who should not be there has a wrong Paid-through: fix it on the roster.
3. Read the letter. Change the opening sentence, the fee or the bank details on the Club's
   screen until it says what the treasurer wants it to say.
4. Set the treasurer's address, if the digest is wanted.
5. Only then set `REMINDERS_ENABLED=true` and restart, and switch reminders on. The switch's
   own label says how many letters it sends that night.

## Running it

The job runs once when the application starts and then once a day. An Administrator can also
run it at once with **Send … now** on the Reminders screen, which sends what is due and the
digest regardless of when the digest last went.

If a letter cannot be sent, that member is not marked as reminded and the next run tries again.

## What it does not promise

- **A letter the sender refuses is tried again the next night.** The term is un-marked so the
  member still gets their one reminder. If a transport ever fails *after* delivering, that member
  could get a second.
- **A member whose subscription renews by itself gets none**, even where a debit under it is
  failing. The payment provider writes to them about that; the treasurer's lists show them.
- **Switching on late sends late.** Anybody already inside the thirty days when reminders are
  switched on is written to that night, however close their date is. The switch says how many.
- The run happens when the application starts and daily from then, not at a fixed hour.

## Not built

- There is one reminder, at thirty days. The further e-mail on the day a Membership runs out,
  which the specification recommends, is the board's decision and is not built.
