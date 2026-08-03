# 07 — Two-way navigation

**What to build:** A member can work from the drawing to the text *and* from the text to the
drawing, jump straight to a number they already know, see at a glance what is not yet recorded,
and send someone a link that opens exactly what they are looking at.

**Blocked by:** 06 — Parts, Listings, and reading a part from a circle.

**Status:** done

- [x] A list of the Tavola's Parts sits beside the drawing, so a member can work from the text
- [x] Selecting a Part in that list moves the drawing to its Mark
- [x] A Position printed in several places cycles through its Marks on repeated selection, so the member learns the part is used more than once
- [x] A member can type a Position number to jump to it
- [x] Typing matches by numeric prefix, so `210` finds `210 S`
- [x] Positions with **no Listing** are visibly marked as not yet recorded, so "not known" is distinguishable from "not yet clicked"
- [x] A link to a specific Position can be copied and opens exactly that Position for another member
- [x] Playwright coverage: list-to-drawing navigation, Mark cycling, and a deep link opening the right Position
- [x] UI and design work uses the `/frontend-design` skill

## Comments

**The list beside the drawing is the catalog's facing page, and the form was borrowed rather
than invented.** A factory parts catalog is a drawing on one side and a numbered table on the
other; anybody who has had one open on a bench has read one. So the right-hand column is now that
page, in the order a hand uses it — the number you already know, then the part you are reading,
then the whole sheet to work down when you know neither — and it is set as a printed table is: a
fixed column for the identifier, hairlines between rows, no decoration on anything that is two
facts. The one thing on it wearing the Club's teal is the number being read, which is the same
teal as its circle on the sheet, because they are one thing being pointed at.

**The index is by *number* rather than by Part, and that is what makes one list answer two
questions.** Story 46 asks for the Tavola's Parts and story 45 asks which numbers have nothing at
them; a list of Parts cannot answer the second, because the interesting rows are the ones with no
Part in them. Listing the sheet's numbers and hanging what is recorded off each says both, and it
also means the browser never has to be told which Positions are empty: a Position that appears
nowhere in `GET /api/tavole/:id/listings` is one nobody has written anything down about. Nothing
was added to the `Position` shape, which still says nothing about what sits at it (ticket 06).

**A Tavola's index carries four fields of a Part and not nine.** The whole Part — description,
transcribed catalog note, the club's note, and every other Tavola it appears on — is a paragraph
or more, and a sheet may carry two hundred numbers with several Parts on each. `ListedPart` is
`Pick<Part, …>` rather than a second Part-shaped type, so a field renamed on one is renamed on
the other; the prose arrives when a member picks a number, from the endpoint that already served
it.

**Being taken to a circle is the viewer's one imperative promise, and it deliberately does not
zoom.** How far in a member is looking is a decision they made, and a list that magnified the
sheet on their behalf would be taking the drawing off them. `DrawingView.show` centres the Mark
at whatever magnification is already set — at the fitted view that is no movement at all, which
is right, because the circle is already on the glass and lighting up is the whole answer — and it
scrolls the *stage* onto the screen, because on a phone the text is below the drawing and moving
a sheet nobody can see is not taking anybody anywhere.

**The chips below the drawing select without moving it, and the index beside it moves it.** That
is the one place two surfaces behave differently and it is deliberate: beside the sheet the
movement is the answer to the gesture, and from a list under the fold the sheet is above the
member and a pan is a gesture nobody watched. It is also what keeps ticket 05's zoom seam
honest — that test proves a circle is clickable at four magnifications by moving the panel off it
with a chip, and a chip that panned the drawing would put the circle it is about off the frame.
If this ever reads as arbitrary, the fix is to make the chips part of the index rather than to
make them pan.

**What is being read lives in the address, so there was never a link to mint.** `?position=210`
is the number the factory printed, not an id: legible in a forum post, retypable by hand, and
resolved by the same forgiving rule that finds a number somebody types — so a link built from
`210` opens `210 S`. The copy button copies the address bar and nothing cleverer, and says so
when a browser refuses the clipboard. Replacing rather than pushing history, because a member
walking a sheet's numbers is reading one screen and should not have to press Back nine times to
leave it.

**And the address is corrected to the number it opened**, which `/code-review` is the reason for:
forgiving resolution meant an address bar reading `210` beside a panel reading `210 S`, and a
member who copied *that* would send somebody a number on no sheet. It is rewritten once, so every
link shared from this screen is exact. A number the sheet does not carry at all is now said
plainly — *this drawing has no number 417 on it; the link may have been meant for another sheet* —
rather than answered with the neutral invitation to click a circle, which reads as though nothing
had been asked for.

**The router's own search encoding had to go, and the browser seam is what found it.**
TanStack encodes every search value as JSON and decodes numeric ones back out as numbers, so
`?position=3` was written `?position=%223%22` — quote marks in a link a member reads down a
telephone — and came back as the number `3`, which crashed a screen built to expect a printed
number. Every search parameter this application has is a string a person could have written, so
`parseSearch`/`stringifySearch` are now sixteen lines that say exactly that, and both routes'
`validateSearch` can be believed.

**The list says nothing about a number until the archive has answered.** The rows are the sheet's
own numbers and arrive with the drawing, so they are printed straight away and can be selected
before the text lands — but *not recorded yet* is a claim, and a list that made it about every
number while the index was still in flight would spend that moment asserting the opposite of what
it is for. `/code-review` found it; no assertion would have, because the claim is true again a
few hundred milliseconds later.

**Cycling is taught by the sentence rather than by an affordance.** Nothing on a screen can say
"select this twice" without a label nobody reads, so the panel says *Printed in 2 places on this
drawing. This is 1 of them — selecting the number in the list again moves to the next.* — and the circle being read
wears one more band than its siblings, so a member watches the heavier ring move between the
places the part is fitted. It wraps at the last rather than stopping: four of four is the way
back round to the first. The sentence names the list rather than saying "select the number
again", because pointing at a *circle* reads that circle and does not step on — which is right,
and which the first wording quietly contradicted.

**The practice archive now prints one number twice**, because a Position with several Marks is
the ordinary case — the factory printed a number wherever the part is used — and story 48 had
nothing to be built or judged against on a sheet where every number appeared once. Positions
became a `Set` of the numbers rather than one row per circle, which is what they always were.

**The hole ticket 06 left open is closed.** `(part, tavola, position)` cannot catch a Part listed
twice on one Tavola at *no* Position, because Postgres counts two NULLs as different; it did not
matter while nothing could be seen, and it matters now that a sheet's position-less Listings are
printed under a heading of their own. A partial unique index closes it, the refusal says which
rule was broken, and the browser seam reaches that state the way it actually happens — an Editor
records a Part at a number and then removes the number.

**Two counts on one row wearing one notation is how somebody orders four of something the car
takes one of.** The index first showed a number printed twice as `×2` beside a quantity of `×2`;
it now reads `2 PLACES` in words under the number. Only a screenshot showed it — the assertion
would have passed either way — which is the second time this ticket a full-page look at the real
screen caught something no test could.

**A Tavola's index names its Positions by id and not by number.** The number was on the wire for
half a day, justified as "so a list can be read without the sheet's Positions" — which nothing
does or is likely to: anything reading a sheet's index is reading it against that sheet. It was
the same fact in two places, free to disagree, and it is gone.

**Position-less Listings can be read here and still not entered.** Ticket 06 pointed at 07 for
both, and only the reading half is here: the index prints them under *Listed without a number*,
and the browser seam reaches that state the way it actually happens. Entering one needs an entry
point that is not anchored to a selected number — an Editor's form, in a ticket whose boxes are
all navigation — so it was left rather than smuggled in. The refusal for a duplicate unplaced
Listing is consequently reachable from the API and not from any screen, which the API seam covers.

**What is deliberately *not* here.** Sub-assemblies (story 49) are ticket 09. There is still no
way to edit a Part after recording it, which ticket 06 named as the sharpest gap it left and
which this ticket did not pick up: the boxes above are all navigation, and quietly adding an edit
form would have been a second feature under one ticket's tests. It should be the first thing 08
or 20 takes. Nothing here counts what is left to do on a sheet either — that is an Editor's
question and ticket 11 answers it.
