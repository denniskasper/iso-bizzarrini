# PROTOTYPE: Ricambi Docs demo outline (throwaway, never merged)

Answers the question "Which pages and sidebar does the Ricambi Docs demo show?". This is a rough take to react to, not the spec.

✅ = written properly for the demo. Everything else shows in the sidebar as **coming**: greyed out, no link.

## Sidebar skeleton

Grouped by what a reader wants to do, the way docs.docker.com groups by task. The heading names the role, so a Member can stop reading at the end of their section.

### Get started
- ✅ **Welcome to Ricambi Docs**: the landing page. What Ricambi is, who each section is for, and a "start here" link per role.
- ✅ **From a car to a part**: the Member's first ten minutes. *Drafted in full: `get-started.md`.*
- Signing in and your password *(coming)*
- Ricambi on a phone in the garage *(coming)*

### Reading the archive: for Members
- Read a drawing: zoom, circles and the table sheets *(coming)*
- What a Position tells you, heading by heading *(coming)*
- Start from a number stamped on the part (Search) *(coming)*
- Compare one system across every car (Categories) *(coming)*
- Sub-assemblies and parts that work together *(coming)*
- Tell the Club what you know (Contributions) *(coming)*
- Your Membership: paid through, renewing, auto-renewal *(coming)*

### Looking after the archive: for Editors
- ✅ **Mark the numbers on a drawing**: Mark positions, Undo, Print unreadable, removing several at once. Its source is the marking guided tour, so every label in it already exists.
- Check a Tavola against its sheets and publish it *(coming)*
- Decide a Contribution *(coming)*
- Write up a Part: names, specifications, notes, photographs *(coming)*
- Confirm or rewrite a Machine translation *(coming)*
- Sub-assemblies and Related Positions *(coming)*
- File a Tavola under a Category *(coming)*

### Running the archive: for Administrators
- Read a catalog: starting, stopping and continuing a Catalog run *(coming)*
- Spending and the Monthly limit *(coming)*
- Show a drawing to Visitors (Samples) *(coming)*
- The roster: members, payments and Editors *(coming)*
- Reminders and the Treasurer's digest *(coming)*
- When a member asks to be erased *(coming)*
- The Legal notice and the Privacy statement *(coming)*
- Categories, Specifications and Units *(coming)*

### Reference
- ✅ **The catalog's words**: Tavola, Position, Mark, Listing, Drawn and Undrawn, Catalog Number, Disegno Origine, Machine translation, Catalog Note and Note. Each is reworded for a reader from `GLOSSARY.md`, without its *Avoid* lines.
- Who can do what: Visitor, Member, Editor, Administrator *(coming)*
- Membership words: Paid-through, Grace, Subscription, Renewal *(coming)*

**Four pages written:** Welcome, From a car to a part, Mark the numbers on a drawing, and The catalog's words. **About 25 coming.**

## Choices to react to

1. **Why this Editor task.** I picked marking over "check and publish" because the marking tour already settled every label and every step, and it is the most visual page to show the Board. Check-and-publish is the more important Editor job (ADR 0017), but it needs an Unchecked Tavola in the screenshots and has no tour to lean on.
2. **Glossary: one page, not a page per term.** That is enough to show the idea. A full build might give each term its own anchor, so pages can link `Tavola` to it.
3. **Nothing on Proposals.** They exist only on Integration and are about Ricambi itself, which `docs/` covers. They stay out of the sidebar, even as "coming".
4. **Nothing for Visitors.** A Visitor needs no manual: a Sample explains itself, and "how to join" is the Club website's job.
5. **The Italian vocabulary** (settled in the draft, so it can be judged there). Use the words **exactly as the screen shows them**. "Tavola" is introduced once as "a factory drawing, which the catalog calls a Tavola" and used freely after that. "Disegno origine" and "Catalog number" appear only where the screen labels them. "Foglio" never appears outside Reference, because no Member-facing screen uses it. Prose says "drawing" and "sheet" the way the app's own sentences do ("Open a drawing", "The parts on this sheet").
6. **Spelling: catalog, not catalogue.** The screens say "catalog". The guided tours say "catalogue", and that inconsistency in the app is worth fixing separately.

## Screenshots the four pages need

These feed the "which Tavola" fog. Every one is from Integration or demo data, taken at phone width unless noted:

- Covered cars (the catalog page)
- A Model's contact sheet of Tavole
- A Tavola with a card open over a circle (once at phone width, once wide)
- The reading panel for one Position, with a drawn Part and an "Also needed" group
- (Editor) Mark positions switched on, with three fresh circles
- (Editor) one circle with Print unreadable ticked

**Careful:** a Member's screenshot of the Tavola page currently also shows Editor panels ("What sits at…", "A whole page at once", "File this drawing"), because they have no role check in the browser. Either take Member screenshots after that is fixed, or crop them.
