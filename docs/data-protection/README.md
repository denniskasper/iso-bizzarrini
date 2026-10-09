# Data protection

The records the association holds as controller for Ricambi (issue #9). The association —
written `<CLUB>` throughout — is the controller; Ricambi is the property that actually
processes members' personal data.

**These are drafts for the association to adopt, not legal advice.** They were written from
what the software does and from the ADRs, and each says where it stops being a description of
the code and becomes a commitment somebody has to keep. The board, or whoever advises it, signs
them off.

**No real name belongs in this directory.** The association's name and address, its board, its
data-protection contact and its processors are kept in the running system — an Administrator
writes them on the Club's screen — precisely so that they are never committed here. Use
`<CLUB>`, `<HOSTING_PROVIDER>` and the like.

| Record | What it is |
| --- | --- |
| [Record of processing activities](record-of-processing.md) | Art. 30 GDPR, drafted for the platform |
| [Technical and organisational measures](technical-and-organisational-measures.md) | Art. 32 GDPR — what protects the data, and who is relied on for it |
| [Telling members](member-information.md) | Art. 13 GDPR — wording the Club reuses when it collects or renews a membership |

The public half is in the application itself: the **legal notice** at `/legal-notice` and the
**privacy statement** at `/privacy`, both readable without signing in and linked from the foot
of every screen. Their sentences describe what the software does and change with it; the facts
in them — who the association is, who its processors are, the retention periods — are read from
the running system.

## Where each fact is kept

| Fact | Kept | Changed by |
| --- | --- | --- |
| The association's name, address, representatives, register entry, VAT number, telephone | The Club's screen, *Legal notice* | An Administrator |
| The data-protection contact and the supervisory authority | The Club's screen, *Privacy statement* | An Administrator |
| The processors, where each handles data, and the date each agreement was signed | The Club's screen, *Who handles members' data* | An Administrator |
| Anything further either page must say in the association's own words | The Club's screen, the two *Further information* boxes | An Administrator |
| How long a lapsed Account and a payment record are kept | `RETENTION_YEARS`, `PAYMENT_RECORD_RETENTION_YEARS` ([ADR 0007](../adr/0007-retention-and-pseudonymised-bylines.md)) | Whoever operates the server |

## Before real members' data arrives

None of these is code, and none can be closed from this repository. Each is the association's.

- [ ] **The legal notice is written.** Until the registered name is filled in, `/legal-notice`
      says the Club has not published its details — true of a practice system and not
      acceptable on a live one.
- [ ] **A data-protection contact is named** on the Club's screen, with an address that is read.
- [ ] **Every processor is named, and every agreement is signed.** The Club's screen states the
      count outstanding in words; it must read *every agreement is signed*. Hosting, backup
      storage and transactional e-mail are needed from the first day. A payment provider is
      named only once payments are taken through Ricambi ([ADR 0004](../adr/0004-payment-in-scope.md));
      until then members pay the Club by transfer. No error-tracking provider is used
      ([ADR 0011](../adr/0011-no-error-tracking-vendor.md)) and the statement says so — if that
      decision is reversed, the provider is named here first.
- [ ] **The privacy statement has been read against the association's existing one** — the Club
      website's, and anything in its statutes or membership form. Where the two differ, either
      the other document is corrected or the difference is explained in *Further privacy
      information*. The retention periods are the likeliest place for a contradiction.
- [ ] **The retention periods are confirmed** — three years for a lapsed Account by the board,
      ten for payment records by the association's accountant ([ADR 0007](../adr/0007-retention-and-pseudonymised-bylines.md)).
- [ ] **Members have been told** their data is going into the platform, in the words in
      [member-information.md](member-information.md), before the first roster is imported.
- [ ] **How long the server's log is kept is decided, configured and published.** The log holds
      the address each request came from. Nothing in this repository rotates it, and the
      privacy statement says what is logged but not for how long; once decided, the period goes
      in *Further privacy information*.
- [ ] **The measures that live outside this repository are in place and tested** — see the
      last section of [the measures](technical-and-organisational-measures.md). A restore is
      performed, not assumed.
- [ ] **The records in this directory are adopted** by the board, dated, and kept where the
      association keeps its papers.
