# 01 — VPS, Caddy and DNS serving both hosts over HTTPS

**What to build:** A visitor can reach both `<CLUB_DOMAIN>` and `ricambi.<CLUB_DOMAIN>` over
HTTPS and get a placeholder page from each. This is the shared foundation both projects sit on,
and the point at which the isolation between them becomes a matter of configuration rather than
intention.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

## Preconditions — settle these before touching DNS

**Access to DNS may not exist yet.** Prior work on this project established that the people
involved held WordPress administrator credentials but **not** the hosting control panel, which
is where DNS is managed. Confirm this before the ticket is picked up, or it stalls at the first
step.

- [ ] Confirmed who holds the hosting control-panel login, the account e-mail, and the provider customer number
- [ ] **MX records are not to be touched.** The Club's e-mail lives in the same hosting bundle as the website; an incautious DNS change takes the Club's mail down
- [ ] Ownership model agreed and recorded: the **hosting account belongs to the Club**, with the developer invited as a technical administrator holding console and SSH access but **no billing or account access**. Either side can end the arrangement without holding the other's assets
- [ ] Two-factor authentication on both the Club's and the developer's provider logins
- [ ] Repository ownership agreed on the same principle — a Club-owned organisation, developer as maintainer
- [ ] Credentials are never committed to a repository

- [ ] VPS provisioned in an EU region; the region is recorded, because the association is the controller for members' personal data
- [ ] Docker Compose runs the stack; nothing is installed ad hoc on the host
- [ ] Caddy terminates TLS with automatic certificate issue and renewal for both hostnames
- [ ] Each hostname is its own server block with its own root, certificate and access log
- [ ] DNS resolves both names to the VPS
- [ ] Each hostname serves a distinct placeholder, so it is obvious which is which
- [ ] HTTP redirects to HTTPS on both
- [ ] Deployment and host configuration live in version control, not only on the box
- [ ] A processor agreement with the hosting provider is noted as required before any real member data is loaded
