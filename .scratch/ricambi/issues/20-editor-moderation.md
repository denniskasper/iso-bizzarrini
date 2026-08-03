# 20 — Editor moderation

**What to build:** An Editor works through what members have sent, decides what gets published,
and — crucially — folds good corrections into the record itself, so the archive improves rather
than accumulating comments pointing out that it is wrong.

This is where story 47 is actually satisfied. There is no diff engine; the Editor reads, judges
and edits. Their hand is the audit trail.

**Blocked by:** 19 — Members contribute; 25 — Correcting a Part and its Listings.

**Status:** ready-for-agent

- [ ] A queue of Contributions awaiting review, **oldest first**, so nothing is forgotten
- [ ] A Contribution is shown **beside the current record** it targets, so it can be judged against what the archive already says
- [ ] An Editor publishes or discards a Contribution
- [ ] An Editor edits the Part record **directly** while reviewing, so a good correction changes the archive
- [ ] A photograph from a Contribution can be promoted onto the Part itself
- [ ] A Contribution against an empty Position can be promoted into a real Part and Listing
- [ ] Published Contributions carry the author's name and date; discarded ones are not published
- [ ] The queue shows how many are waiting, somewhere an Editor will notice
- [ ] Editors' own catalog edits do not enter the queue — they have edit rights and simply make the change
- [ ] UI and design work uses the `/frontend-design` skill
