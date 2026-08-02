# 02 — Nightly encrypted offsite backups with a performed restore

**What to build:** If the VPS is lost tomorrow, everything on it can be brought back. The scans
and the Marks placed on them exist nowhere else, so this has to be real before either project
holds anything that matters — not configured and assumed, but exercised.

**Blocked by:** 01 — VPS, Caddy and DNS serving both hosts over HTTPS.

**Status:** ready-for-agent

- [ ] A nightly job backs up the database and all stored files
- [ ] Backups are encrypted before leaving the machine
- [ ] Backups are written to a **different provider** from the one hosting the VPS
- [ ] A retention schedule exists, so a corruption discovered late is still recoverable
- [ ] The host's own snapshots are configured as fast rollback and are explicitly **not** counted as the backup
- [ ] A restore has actually been performed into a clean environment and the result verified
- [ ] The restore procedure is written down, in enough detail that someone who did not build it can follow it
- [ ] Backup failures are alerted on — a silently broken backup is the failure mode this ticket exists to prevent
