# 02 — Non-production environment

**What to build:** An internal system where Editors can practise and the board can review, which
nobody could mistake for the real archive — and which is structurally incapable of e-mailing a
member or touching a real payment mandate.

Built early on purpose. The most common way a club leaks its own roster is a demo environment
loaded from production, and the most embarrassing failure available is a test system sending a
real member a real demand for money.

**Blocked by:** 01 — App skeleton with both test seams.

**Status:** ready-for-agent

- [ ] A non-production environment deployed alongside production, behind the same sign-in gate
- [ ] Permanent, non-dismissible banner on every page identifying it as not the real archive
- [ ] Visibly different colour scheme from production
- [ ] `DEMO` in the document title, so a browser tab is identifiable at a glance
- [ ] `noindex` on every page
- [ ] Seed data is **generated**, never copied from production
- [ ] Outbound e-mail is disabled or captured to a mailbox no member can reach
- [ ] Reminder sending is disabled in this environment and cannot be enabled by accident
- [ ] Payment provider keys are test-mode and structurally incapable of reaching a real mandate
- [ ] A written check confirms no production data of any kind is present
- [ ] UI and design work uses the `/frontend-design` skill
