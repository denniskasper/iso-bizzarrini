# Legal pages: the facts are the Club's record, the sentences are the code's

Ricambi carries its own legal notice and privacy statement (issue #9), and both have to be
editable without a deployment, because the association's details change. The obvious shape is
two rich-text pages an Administrator edits. We did not build that.

A privacy statement is a description of what the software does. Text an Administrator can
rewrite freely can come to promise what the system does not do — an erasure it cannot perform,
a processor it no longer uses — and nothing would fail when it did. ADR 0007 already took this
position for the retention figures, which the statement reads from the configuration the sweep
is handed.

So the two pages are split along that line:

- **What is a fact about the association is data**, kept on the Club's record and in a small
  table of Processors, and written by an Administrator: who the association is, who represents
  it, who answers for data protection, which authority oversees it, and which company does
  what. These are also exactly the names this repository must never contain.
- **What is a sentence about the software is code**, written where it is shown and changed in
  the commit that changes the behaviour it describes.
- **Each page ends with a free-text box** the association fills in its own words, for whatever
  it has to state that is neither — a liability notice, a pointer to the Club website's own
  statement, how long the server's log is kept.

## Consequences

A Processor is one row per kind of work, and the kinds are fixed at five. `error-tracking` is
one of them although nobody does it (ADR 0011), so that the statement says "nobody" on purpose;
`payment` likewise until payments are taken through the platform (ADR 0004). A new kind of
processor is a code change, because it needs a sentence.

The date a processor agreement was signed lives on the same row and is never published. That
makes the Club's screen the place agreements are tracked to completion, and it is why the
public answers are built field by field rather than by sending the record.

An association that has written nothing has a legal notice that says so. That is right for a
practice system and is a go-live blocker for a real one; it is on the checklist in
`docs/data-protection/README.md`, with everything else here that code cannot close.

Changing the wording of the statement itself still needs a deployment. That is the cost, and
it is the point.
