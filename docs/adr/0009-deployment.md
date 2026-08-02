# Deployment: one EU VPS, Caddy, two hosts, all data on the box, offsite backups

Both the club's public site and Ricambi run on a single VPS in an EU region — required, since
the association is the controller for members' personal data and a processor agreement with
the hosting provider must be in place before real member data lands. Containers under Docker
Compose, with Caddy terminating TLS (automatic ACME for both hosts) and reverse-proxying.

Two hosts, not two paths: the public site on the club domain, Ricambi on its own subdomain.
A subdomain scopes the session cookie so the public site never receives it, and gives each
side its own server block, root, certificate and logs — isolation expressed in configuration
rather than in discipline.

Postgres, the original scans, generated tiles and member photographs all live on the box, so
tiles are served from local disk and the viewer stays fast. A VPS offers no durability
guarantee, and the scans plus the Marks placed on them exist nowhere else, so **nightly
encrypted backups go to a different provider**; the host's own snapshots are fast rollback,
not backup. A restore must actually be performed, not assumed.

## Consequences

Transactional e-mail — invitations, reminders, renewal notices — is sent through a dedicated
provider with SPF, DKIM and DMARC configured, never from the VPS, whose shared address ranges
would put load-bearing mail in spam folders and lock members out.
