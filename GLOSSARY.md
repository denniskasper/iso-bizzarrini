# Ricambi

A members-only parts reference for Iso and Bizzarrini cars, keyed to the original factory
parts catalogs. Members navigate the way enthusiasts already do: choose a car, open the
factory drawing, click the numbered position, read the part.

## The catalog

**Model**:
A vehicle as the factory catalogs distinguish them — brand, model, series and model years.
The only vehicle-shaped thing in the language; there is nothing below it.
_Avoid_: Car, vehicle, variant, type

**Tavola**:
A factory exploded-view drawing belonging to one Model, carrying an Italian and an English
name. Its number is meaningful only within its Model. Printed across one drawing sheet and
however many table sheets it takes to list what is drawn.
_Avoid_: Diagram, plate, drawing, illustration

**Foglio**:
One physical sheet of a factory catalog, numbered by the factory in large type at its corner —
*175*, *150bis*. Several fogli make up one Tavola, so a Foglio number says where something was
read from and never which Tavola it is.
_Avoid_: Page, sheet number, drawing number

**Scan**:
The picture of a Tavola's drawing foglio — the one sheet Marks are placed on. A Tavola has one.
_Avoid_: Image (the general word, below), drawing, picture

**Table sheet**:
The picture of one of a Tavola's table fogli, kept as the evidence its Listings were read from.
A Tavola has as many as the factory printed. As private as the Scan.
_Avoid_: Parts list, table scan, page

**Unchecked / Published**:
Whether an Editor has compared a Tavola against its fogli. An Unchecked Tavola was read by
machine and is shown to nobody but Editors; publishing it is an Editor's statement that it
says what the factory printed.
_Avoid_: Draft, pending, imported, verified

**Sample**:
A Published Tavola an Administrator has chosen to show to Visitors, with one of its Positions
open. Shows what the factory printed and nothing the club added to it.
_Avoid_: Showcase, public Tavola, teaser, preview

**Reading**:
One pass over one Table sheet, turning what is printed there into rows. Every Table sheet is
read twice, independently; where the two Readings differ on a Position, a Catalog Number or a
quantity, the row is in doubt.
_Avoid_: Reader, pass, scan (that is the drawing), OCR

**Reading method**:
What produced a Tavola's Readings — a particular model or piece of software. A Tavola is read
by one, and an Editor can see which; a Member never can.
_Avoid_: Reader, engine, provider, backend

**Catalog run**:
One Administrator-started pass over one uploaded catalog PDF for one Model. It is estimated
before it starts, held to its limit, can stop and be continued, and is recorded.
_Avoid_: Reading (that is one pass over one Table sheet), import, job, batch

**Category**:
The system of the car a Tavola belongs to — Brakes, Electrical, Fuel. Groups tavole within a
Model and across Models. A name, never a code. The list is maintained by an Administrator; an
Editor chooses from it, and a Tavola may have none yet.
_Avoid_: Section, group, type

**Catalog Section / Catalog Group / Catalog Subgroup**:
The factory's own classification, printed on the sheet as *Sezione*, *Gruppo* and
*Sottogruppo*. Recorded as the factory wrote it. **Not** the same as a Sub-assembly — these
sit above the Tavola, a Sub-assembly sits inside it.

**Position**:
A number printed on a Tavola. Exists in its own right, whether or not anything is known
about what sits there.
_Avoid_: Item, reference, index, callout, part number

**Mark**:
A place on the scan where a Position's number appears. A Position may have several, because
the factory printed the same number wherever the part is used, or none at all.
_Avoid_: Hotspot, pin, annotation, marker

**Sub-assembly**:
A named group of Positions within one Tavola — *Window Slider*, *Door Lock* — outlined on
the Scan, with Photographs and a Note of its own, because it is what restorers photograph and
talk about rather than its single screws. It is not itself a Part and cannot be ordered.
_Avoid_: Assembly, group, sottogruppo, kit

**Related Position**:
A Position an editor has linked to another within the same Tavola, because the two parts
work together. Narrower than a Sub-assembly, and always mutual.
_Avoid_: See-also, cross-reference, linked part

**Part**:
A component, identified in its own right rather than by where it appears. The same Part may
be listed on many Tavole and fit many Models.
_Avoid_: Item, component, product, article

**Catalog Number**:
The factory's identifying number for a Part — the one it was ordered by, printed under
*N° Ordinazione*. Two Parts never share one. A Part may have none.
_Avoid_: Product ID, part number, article number, SKU

**Disegno Origine**:
The original factory drawing number for a Part, printed under that heading on the technical
office's sheets — *260 06 110*. Authoritative when known, but not what tells two Parts apart.
_Avoid_: Drawing number, origin number, DO

**Listing**:
One Part's appearance on one Tavola: where it sits, how many are fitted per car there, and
whether it is drawn. The same Part listed twice may need different quantities.
_Avoid_: Entry, row, appearance, occurrence, placement

**Drawn / Undrawn**:
Whether the Part is the one the Position's number points at. Undrawn Parts — the screws and
washers that fasten a drawn Part — share its Position but appear on no drawing. Several
*drawn* Parts at one Position are either alternatives or a handed pair, the left and right of
the same thing; *undrawn* ones are additional. The factory marks both with a dash where the
Position's number would be: on the catalog's own sheets the dash is an undrawn Part, on the
technical office's it is the other hand of a pair.
_Avoid_: Visible, invisible, hidden, implied

**Specification**:
One stated property of a Part — its material, its colour, a dimension, its weight — as a name
and a value. The name comes from a list an Administrator keeps, and fixes the **Unit** its value
is counted in, so two Parts' weights can always be compared; a name without a Unit, such as
*Material*, takes words instead of a number. Written by an Editor. A standard the
Part conforms to is an Equivalent, not a Specification.
_Avoid_: Attribute, property, field, spec, characteristic

**Unit**:
What a Specification's quantity is counted in, written one way only — *g*, *mm*, *Nm*. Kept in a
list by an Administrator and fixed by the Specification's name, never typed, so the same
quantity is never written two ways.
_Avoid_: Measure, dimension, UoM

**Fitment**:
A statement that a Part fits a Model, with an optional qualifier in the words whoever knew
it would use — *"1963–64"*, *"from chassis #310"*, *"late"*.
_Avoid_: Compatibility, application, fits, usage

**Equivalent**:
Another way to obtain what a Part does: an original-equipment supplier's number, another
manufacturer's number, an industry standard, or a donor vehicle the same component was
fitted to.
_Avoid_: Cross-reference, alternative, substitute, OEM

**Source**:
Somewhere a Part has been available, optionally with a price and the date that price was
seen. A price is never meaningful without its date.
_Avoid_: Supplier, vendor, dealer, shop

**Machine translation**:
An English name nobody has vouched for, produced from the Italian the factory printed. Shown
with the Italian beside it and labelled as such until an Editor confirms or rewrites it —
which is a separate judgement from publishing the Tavola it came from.
_Avoid_: Auto-translation, draft name, unverified

**Catalog Note**:
Text transcribed from the factory catalog, in the factory's words. Evidence, not opinion.
_Avoid_: Comment, catalog comment, remark

**Note**:
What the club has established about a Part, written by an Editor. Distinct from a Catalog
Note, which nobody may improve.
_Avoid_: Comment, remark, description, technical comment

**Photograph**:
A picture of a Part, in the order an Editor put them in — the first being the one that
identifies it. Of the component and never of its appearance on a sheet, so one Photograph
serves every Tavola the Part is listed on. As private as a Scan.
_Avoid_: Image, photo, attachment, media

*Image* is the archive's word for a stored picture of **either** kind — a Tavola's Scan or a
Part's Photograph — and is why the storage and serving code is named for it. It is the general
word and not a synonym for this one: an Image is what the two have in common, a Photograph is
one of them.

## Contributions

**Contribution**:
Something a Member offers about a Part, a Position or a Sub-assembly — what they know, in their words, with
photographs if they have them. Carries their name and the date, and is checked before anyone
else sees it.
_Avoid_: Comment, post, submission, suggestion, edit

## People and access

**Club**:
The association whose roster decides who may read the archive. Eligibility comes from the
Club, never from the platform.

**Visitor**:
Somebody reading Ricambi without signing in. Sees the Samples, which Models the archive covers
and how much of each, and how to join the Club; nothing else of the archive.
_Avoid_: Guest, anonymous user, prospect, the public

**Account**:
One person's identity on the platform, known by their e-mail address. Owns their password
and everything they have contributed.
_Avoid_: User, profile, login, member record

**Membership**:
One Account's standing in the Club, ending on a date. An Account may hold more than one.
_Avoid_: Plan, registration, subscription (a **Subscription** is how one may be paid for, not the thing itself)

**Paid-through**:
The date a Membership runs to. Reading the archive requires one that has not passed, or **Grace**
past it.
_Avoid_: Expiry, renewal date, valid until, last payment date

**Grace**:
The days past a Paid-through that a member whose Subscription renews itself may go on reading
while the bank confirms the renewal payment. Changes who may read, never what was paid for: the
Paid-through does not move, and a Retention period is still counted from it.
_Avoid_: Grace period (that is often mistaken for the **Retention period**), extension, overdue

**Member**:
An Account that may read the archive and offer Contributions.

**Editor**:
An Account that may also decide Contributions and change what the archive says, for every
Model.
_Avoid_: Moderator, curator, maintainer

**Administrator**:
An Account that may also maintain the roster, record payments, and appoint Editors.
_Avoid_: Admin, superuser, operator, club officer

**Former member**:
What a published Contribution says where its author's name stood, once their Account is gone.
A byline, not a person: nothing on the platform can say which former member.
_Avoid_: Deleted user, anonymous, unknown

**Erasure**:
An Administrator deleting one person's Account and personal data because they asked. What
they published stays, under "former member"; what nobody had published goes with them.
_Avoid_: Deactivation, removal, account closure

**Retention period**:
How long a lapsed Account is kept before it is deleted automatically, counted from its
Paid-through. Set by the association, not by the platform.
_Avoid_: Expiry, grace period, archive period

**Payment record**:
A Membership term the Club was paid money for. Kept for the statutory accounting period with
the payer's name, whether or not their Account still exists — the one thing an Erasure does
not erase.
_Avoid_: Invoice, receipt, transaction

**Subscription**:
A member's standing arrangement with the payment provider to pay the fee each year. Grants
nothing by itself: a Membership term is granted when a payment under it is confirmed. Whether
it will collect again is its *auto-renewal*, which the member can turn off in one press.
_Avoid_: Plan, mandate, recurring payment, auto-pay

**Renewal**:
What a member is told in order to buy a new Membership term: the amount, where to send it,
the words to write on the transfer and who to ask. Instructions to a person, not a record of
anything — nothing is written when one is read. It describes the bank transfer, which the
Club receives and an Administrator records; paying through the platform is a **Subscription**.
_Avoid_: Renewal date (that is the **Paid-through**), invoice, checkout

**Reminder**:
The one e-mail a member is sent before a Membership term ends, carrying the **Renewal**. One
per term, and only where an Administrator has switched reminders on.
_Avoid_: Notification, dunning, renewal notice, nag

**Treasurer's digest**:
The weekly list, sent to the treasurer, of members whose Membership is about to run out or
just has, each with the payment reference to expect. The same lists are on the Reminders
screen.
_Avoid_: Report, statement, overdue list

**Club office**:
Whoever answers for the association when something is wrong that money will not fix. A
correspondent rather than a role on the platform, which is why it has an address and no
capabilities — it is what "contact the Club office" points at, on the sign-in screen and on
the Renewal.
_Avoid_: Club officer (that is close to **Administrator**), support, helpdesk, admin team

**Legal notice**:
The page that says who the association is and how to reach it — what German law calls an
*Impressum*. Everything on it is the Club's own record, written by an Administrator.
_Avoid_: Impressum, imprint, about page

**Privacy statement**:
The page that says what the platform holds about a person, who else handles it, how long it is
kept and what cannot be erased. Its sentences describe the software; its facts are read from
the running system.
_Avoid_: Datenschutzerklärung, privacy policy, data policy

**Processor**:
A company that handles members' personal data on the association's behalf — the host, the
backup store, the e-mail provider. Named in the Privacy statement, one per kind of work, with
the date its agreement was signed kept as the association's own record.
_Avoid_: Vendor, supplier, sub-processor, third party

## The platform itself

**Version**:
The number that says which Ricambi somebody is looking at, in three parts read by who has to
notice: the last moves when something wrong was put right, the middle when somebody can do
what they could not before, the first when somebody has to act or relearn. There is one, for
the whole platform.
_Avoid_: Build, revision, release number

**Release**:
The deliberate act that gives Ricambi a new Version, and the thing it produces. Work that has
been merged but not yet released still carries the Version of the Release it descends from.
_Avoid_: Deploy, rollout, update

**Production**:
The system the members read: the archive itself, holding the roster and everything the Club
has recorded. There is one.
_Avoid_: Live, prod, the real system

**Integration**:
The practice system where the next Release is seen and tried before it reaches Production. Its
catalog and its roster are invented, and nothing in it is ever copied from Production.
_Avoid_: Preview, staging, demo, test system

**Development**:
A developer's own machine, running Ricambi to change it. Never reachable by anybody else.
_Avoid_: Local, dev box, sandbox

**Proposal**:
What somebody hands the developers about Ricambi itself, worked out in conversation on
Integration: a **Fix** when something is wrong, an **Idea** when something should be new. Carries
their own notes and screenshots and the summary the conversation ends on. Changes nothing by
itself; a developer decides what becomes of it.
_Avoid_: Ticket, issue, feedback, request, suggestion, Contribution (that is about a Part)
