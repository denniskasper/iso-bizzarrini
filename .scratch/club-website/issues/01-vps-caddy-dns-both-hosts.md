# 01 — VPS, Caddy and DNS serving both hosts over HTTPS

**What to build:** A visitor can reach both `<CLUB_DOMAIN>` and `ricambi.<CLUB_DOMAIN>` over
HTTPS and get a placeholder page from each. This is the shared foundation both projects sit on,
and the point at which the isolation between them becomes a matter of configuration rather than
intention.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] VPS provisioned in an EU region; the region is recorded, because the association is the controller for members' personal data
- [ ] Docker Compose runs the stack; nothing is installed ad hoc on the host
- [ ] Caddy terminates TLS with automatic certificate issue and renewal for both hostnames
- [ ] Each hostname is its own server block with its own root, certificate and access log
- [ ] DNS resolves both names to the VPS
- [ ] Each hostname serves a distinct placeholder, so it is obvious which is which
- [ ] HTTP redirects to HTTPS on both
- [ ] Deployment and host configuration live in version control, not only on the box
- [ ] A processor agreement with the hosting provider is noted as required before any real member data is loaded
