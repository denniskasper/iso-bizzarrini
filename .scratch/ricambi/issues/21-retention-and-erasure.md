# 21 — Retention and erasure

**What to build:** The Club can meet its data-protection obligations without tearing holes in the
archive. Personal data goes; the knowledge stays.

Contributions are personal data *and* they are the archive. Deleting someone's Contributions when
they leave, die, or ask to be forgotten would destroy exactly what the platform exists to
preserve — so the identification goes and the knowledge remains.

**Blocked by:** 20 — Editor moderation.

**Status:** ready-for-agent

- [ ] Lapsed Accounts are retained, so a returning member finds their history intact
- [ ] Accounts lapsed beyond the retention period are deleted **automatically**, so the rule is applied rather than remembered
- [ ] The retention period is configurable, defaulting to the value the association confirms (proposed: three years)
- [ ] An Administrator can delete a person's personal data on request
- [ ] On deletion or erasure, **published Contributions remain** and the byline becomes "former member"
- [ ] Contribution text is not automatically altered; personal data inside a specific text is an editorial job on that text
- [ ] **Payment records are retained for the statutory accounting period** regardless of erasure
- [ ] The privacy statement's wording matches what the system actually does, including what cannot be erased
- [ ] The retention sweep is driven by the injected clock and is tested by advancing it
- [ ] A dry-run reports which Accounts a sweep would delete, before it deletes them
- [ ] UI and design work uses the `/frontend-design` skill
