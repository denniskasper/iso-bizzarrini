# Scans, tiles and photographs are private and served behind authentication

Members contribute their knowledge on the understanding that only paid-up members can see the
archive. A single public image URL breaks that promise for the whole scanned collection, and
search engines index what they find. So the original scans, the generated deep-zoom tiles and
member photographs are never on a public path.

Tiles are served through an authenticated route — Caddy's `forward_auth` asks the application
to validate the session and a live Membership before any file is served — with long,
immutable cache headers so that panning around a drawing re-requests almost nothing. At this
membership's scale the per-request check costs nothing, and revocation stays immediate, which
is what "access blocked on expiry" requires.

## Consequences

A plain CDN cannot be put in front of the tiles without solving signed cookies first. The known
lever, if it ever matters, is a short-lived token minted when a member opens a Tavola — faster,
but it weakens revocation to the token's lifetime. Do not "optimise" tile delivery by making
the storage public.
