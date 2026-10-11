# Retention: accounts are deleted, Contributions survive with pseudonymised bylines

Contributions carry their author's name and date, which is what makes them judgeable — and
also makes them personal data attached to content the archive depends on. Deleting a person's
Contributions when they leave, die, or ask to be forgotten would tear holes in the shared
knowledge the platform exists to preserve.

Lapsed Accounts are kept, so a returning member finds their history intact. After a defined
period lapsed — proposed as three years, to be confirmed by the association — the Account and
its personal data are deleted automatically. On deletion or an erasure request, published
Contributions remain and the byline becomes "former member": the knowledge survives, the
identification does not. Where a Contribution's *text* contains personal data, that is an
editorial job on that specific text.

Payment records are retained for the statutory accounting period regardless, and the privacy
statement must say so rather than promise an erasure the association cannot perform.

## As built (issue #7)

Three things the paragraphs above left open, decided when the rule was implemented.

**Only published Contributions survive.** One still waiting, or one an Editor discarded, was
never part of the archive; it is deleted with its author, photographs included.

**A payment record keeps the payer's name.** A Membership term that records money outlives the
Account: its link to the Account goes and the name is copied onto the row at that moment, since
an unattributed payment is no use as an accounting record. Terms that record no money — opening
entries, lines of the annual list — are deleted with the Account. Payment records of people
already gone are themselves deleted once a configurable number of full calendar years has
passed since the year the money arrived (`PAYMENT_RECORD_RETENTION_YEARS`, default ten — to be
confirmed by the association's accountant, like the three years above).

**The sweep is the application's own.** It runs at start-up and daily inside the one container
(ADR 0009), on the injected clock, rather than as a cron job somebody has to remember to
install. `roster:retention-sweep --dry-run` and the foot of the roster screen both show who it
would delete next. Backups are outside it: a copy made before a deletion holds what was
deleted until it is rotated out, and the privacy statement says so.

## As built (issue #18)

**The sweep never deletes the last Administrator.** The roster is behind the role and not
behind a Membership, so a lapsed Administrator can still be the person running the Club.
Administrators are swept like anyone else, except where every Administrator on the roster is
past the period: then the one whose Membership ran out most recently is kept, and the rest are
deleted. The dry run — `GET /api/roster/retention`, the foot of the roster screen and
`roster:retention-sweep --dry-run` — names the one kept and why, apart from those it would
delete. Erasure on request is unchanged: an Administrator cannot erase the Account they are
signed in with, and can erase any other.
