# 24 — Platform legal pages and data-protection records

**What to build:** The platform's own Impressum and Datenschutzerklärung, reachable by anyone
who lands on it, plus the records the association needs to hold as controller.

We had put the legal pages on the Club website only. **The platform needs its own.** A German
site carries an Impressum whether or not a sibling site has one, and this is the property that
actually processes personal data — rosters, e-mail addresses, payment dates, payment references,
Contribution bylines.

**Blocked by:** 15 — Authorisation and the renewal screen; 21 — Retention and erasure.

**Status:** ready-for-agent

## On the platform

- [ ] Impressum, reachable from every page including the signed-out landing and sign-in pages
- [ ] Datenschutzerklärung, likewise reachable without signing in
- [ ] The privacy statement describes what is actually processed: roster data, sign-in, Contributions and their bylines, photographs, payment data, and error tracking
- [ ] It names the processors — hosting, storage, transactional e-mail, payment provider, error tracking
- [ ] It states the retention rule and, plainly, **what cannot be erased**: payment records held for the statutory accounting period, and Contributions that remain under "former member"
- [ ] Both pages are editable without a deployment, since the association's details change
- [ ] English, matching the platform — the Club website carries its own German versions

## Records the association must hold

- [ ] **Art. 30 record of processing activities** drafted for the platform
- [ ] **Technical and organisational measures documented** — TLS, access control, role separation, backups, encryption at rest offsite
- [ ] **Art. 13 information duty when clubs hand over rosters.** Members must be told their data is going into the platform. Supply **wording the Club can reuse** when it collects or renews a membership — this is the obligation most likely to be missed, because it falls on the Club rather than on us
- [ ] **Data minimisation on roster import**: only the fields the access check genuinely needs. Anything the import can do without, it does without
- [ ] A named data-protection contact on the association's side
- [ ] Processor agreements tracked to completion — hosting, storage, e-mail, payment, error tracking — with none outstanding at go-live
- [ ] Checked against any existing privacy statement the association already has, so the two do not contradict each other
