# 16 — Roster spreadsheet import

**What to build:** An Administrator loads the Club's membership list from a spreadsheet instead of
typing it. This is the one permanent import in the product, because it genuinely recurs and has no
curated state underneath it to destroy.

**Blocked by:** 14 — Accounts, Memberships, roster and invitations.

**Status:** ready-for-agent

- [ ] An Administrator uploads a spreadsheet of members with names, e-mail addresses and Paid-through dates
- [ ] The import **adds and updates only — it never deletes**. A truncated or partial file can never lock out the membership
- [ ] A preview shows exactly what will be created and what will be changed before anything is written
- [ ] Rows matching an existing Account by e-mail update that Membership rather than creating a second Account
- [ ] Rows that cannot be parsed are reported individually and do not block the rest
- [ ] Importing does **not** send invitations; inviting stays a separate, deliberate act
- [ ] Removing someone's access is an explicit action, never a side effect of an import
- [ ] Date formats are validated rather than guessed; an ambiguous date is a reported error
- [ ] UI and design work uses the `/frontend-design` skill
