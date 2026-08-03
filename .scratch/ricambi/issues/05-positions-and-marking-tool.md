# 05 — Positions and the marking tool

**What to build:** An Editor works through a Tavola placing Marks on the numbered circles, and a
member sees those circles on the drawing. Nothing is known yet about what any of them are — that
is the point: marking up and entering part data are separate evenings' work, and a Tavola may sit
half-built indefinitely.

**This tool's speed is the project's critical path.** A Tavola can carry over 200 Positions, there
are hundreds of Tavole, and the work is volunteers' evenings. Placing a Mark must be one click.

**Blocked by:** 04 — The drawing viewer.

**Status:** done

- [x] A Position belongs to a Tavola and exists independently of any Part
- [x] Position numbers are stored **as printed**, including letter suffixes such as `210 S` and `211 D`, with a derived numeric sort key
- [x] An Editor places a Mark by clicking the drawing — one click, no dialog
- [x] A Position may carry **several Marks**, because the factory printed the same number wherever the part is used
- [x] A Position may carry **no Mark**, meaning listed but not drawn
- [x] Marks are stored in fractional image coordinates, so re-scanning at a different resolution does not invalidate the work
- [x] A Mark can be moved or removed
- [x] Marks render as fixed-radius circles pinned to the image, staying aligned at every zoom level
- [x] Circles are large enough to hit with a thumb on a phone
- [x] Playwright coverage: a Mark is clickable and lands on its Position at several zoom levels
- [x] UI and design work uses the `/frontend-design` skill

## Comments

**One click is one request, and that is the whole design of the API.** `POST /api/tavole/:id/marks`
carries the number the factory printed — not an id — and finds or records the Position and places
the circle in a single round trip. Naming the Position by its number is the load-bearing part: at
the moment an Editor clicks, what they know is what is on the paper, and whether the archive has
heard of that number yet is the archive's problem. A tool that cost a lookup and then a write
would cost twice as many evenings, and there are hundreds of them.

**Every write answers with the whole sheet, which looks wasteful and is not.** A response
carrying only the Position that changed would leave the browser to work out where it belongs in
the catalog's order — and that order is the archive's rule, under the database's own collation.
Sorting `12 bis` in two places is two answers waiting to disagree. The sheet is a few kilobytes
even at two hundred Positions, against a scan measured in megabytes, and the browser now never
sorts a catalog at all.

**The repeat case is where "one click" was nearly lost.** The field advances by one after every
placement, which is right for working down a sheet — but the factory prints one number wherever
the part is used, so the *second* circle of a run would have cost a click and re-typing what had
just been placed. **Keep this number** is the answer and the only reason that control exists: the
number stops advancing and every click adds another circle to the same Position. It came out of
`/code-review`, which caught that the one case the archive most needs marked properly was the one
case that was not one click.

**A Mark has two sizes, and that is deliberate.** What is *seen* is a fixed fraction of the sheet,
so the ring sits on the number the factory printed at every magnification instead of growing to
swallow the drawing; what can be *hit* never goes below 44 CSS pixels on the glass, because the
hand doing the hitting is cold. The viewer keeps both in the drawing's own pixels and writes the
second as one CSS variable — only when the magnification actually changes, never on a pan, because
a custom property invalidates the style of everything below it and two hundred circles
recalculating inside every frame of a drag is exactly what ticket 04's `translate3d` was for.
That one was found by the browser seam: an existing viewer test started timing out.

**The ring's size is a guess, and it is the one number here without evidence behind it.** It is
fitted to the circles the practice drawing prints, because no real factory scan has ever been
measured — the same open question ADR 0013 records and ticket 03 is still waiting on. On a real
sheet carrying two hundred Positions the printed circles are likely a good deal smaller relative
to the page, and the ring would then be too large at low magnification. It is one named constant
in one file, `MARK_RING`, and it belongs on the list of things a dozen real scans reopen.

**Selecting on the press rather than on the click**, which is not the obvious choice. The viewer
captures the pointer in order to pan, and a capture takes the click with it — so a circle that
waited for one would either never be read, or would have to stop the press and leave a member
unable to drag the sheet by the part of it that has circles on it. On a Tavola carrying two
hundred, that is most of the sheet. While the marking tool is on it is the other way round: a
press on a circle is an Editor picking it up.

**Beyond what was asked, and said plainly.** Removing a **Position** is not in any box above —
only removing a Mark is. It is here because the one-click tool records a Position the moment the
drawing is clicked, so a mistyped number becomes a real row with no way back; "mistakes are cheap"
(story 99) is not true of a tool that can only undo half of what a click creates. It is one route,
one button, and it is the only scope added.

**What is deliberately *not* here.** The Position list under the drawing counts nothing and
reports no progress — how much of a Tavola is left to do is an Editor's question and ticket 11
answers it, for a Model as well as for a sheet. The panel that names the selected Position renders
no Part data, because there are no Parts yet; ticket 06 fills it in and moves it beside the
drawing. And a Position printed in several places does not yet cycle through its circles — that is
ticket 07 — though the Marks are already reported in reading order down the sheet so that it can.

**What `/code-review` changed.** `--mark` was the Club's teal written out a second time and is now
the accent itself, named for its job. `MarkPoint` is declared once in the contracts and travels
through both sides, instead of a loose `{ x, y }` written out at ten layers. The five marking
mutations no longer each carry their own copy of the same success handling, and `fraction` — "how
far along something a point is" — is one function in `viewport.ts` rather than three. The
component listing the sheet's numbers was called an *index*, which `CONTEXT.md` reserves as a word
to avoid near Positions. The visual language gained a sentence: the accent's second sanctioned use
now covers **a Mark and the Position it belongs to wherever else that Position appears**, because
a circle in teal and its number in grey are one thing shown in two colours.
