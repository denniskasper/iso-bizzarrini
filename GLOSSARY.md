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
name. Its number is meaningful only within its Model.
_Avoid_: Diagram, plate, drawing, illustration

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
A named group of Positions within one Tavola — *Window Slider*, *Door Lock*. A labelling
device; it is not itself a Part and cannot be ordered.
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
The factory's identifying number for a Part, as printed in the catalog's first column. Two
Parts never share one. A Part may have none.
_Avoid_: Product ID, part number, article number, SKU

**Disegno Origine**:
The original factory drawing number for a Part. Authoritative when known, but not what tells
two Parts apart.
_Avoid_: Drawing number, origin number, DO

**Listing**:
One Part's appearance on one Tavola: where it sits, how many are fitted per car there, and
whether it is drawn. The same Part listed twice may need different quantities.
_Avoid_: Entry, row, appearance, occurrence, placement

**Drawn / Undrawn**:
Whether the Part is the one the Position's number points at. Undrawn Parts — the screws and
washers that fasten a drawn Part — share its Position but appear on no drawing. Several
*drawn* Parts at one Position are alternatives; *undrawn* ones are additional.
_Avoid_: Visible, invisible, hidden, implied

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
Something a Member offers about a Part or a Position — what they know, in their words, with
photographs if they have them. Carries their name and the date, and is checked before anyone
else sees it.
_Avoid_: Comment, post, submission, suggestion, edit

## People and access

**Club**:
The association whose roster decides who may read the archive. Eligibility comes from the
Club, never from the platform.

**Account**:
One person's identity on the platform, known by their e-mail address. Owns their password
and everything they have contributed.
_Avoid_: User, profile, login, member record

**Membership**:
One Account's standing in the Club, ending on a date. An Account may hold more than one.
_Avoid_: Plan, registration, subscription (a **Subscription** is how one may be paid for, not the thing itself)

**Paid-through**:
The date a Membership runs to. Reading the archive requires one that has not passed.
_Avoid_: Expiry, renewal date, valid until, last payment date

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
