# The club website is rebuilt as a static site, not migrated

The original specification left the public club website out of scope. That is overridden: the
site moves onto the same VPS as Ricambi — and is therefore **retired and rebuilt rather than
moved**.

The existing site runs WordPress on a PHP release that has had no security fixes since 2019,
with a page-builder plugin from 2016 that is among the most exploited in WordPress's history.
That combination is precisely the "unmaintained hobby infrastructure rots" failure the project
was founded to avoid, and putting it on the same machine as the member roster, payment
references and session secrets would remove the one thing currently protecting them: that the
two fail independently. Container isolation mitigates *unlikely* compromise; this configuration
makes compromise likely, which is a worse trade than not having it.

The replacement is a static site built with Astro and edited through Sveltia CMS — a
client-side admin backed by the Git repository, so there is no server, no database and nothing
to patch. Images are committed to the repository, converted on upload and optimised at build.

## Consequences

Page layouts are stored as page-builder shortcodes and do not convert; pages are **re-created**,
not migrated, and only text, images and the news archive carry over mechanically. URLs are
preserved or permanently redirected. Self-hosted fonts and no tracking mean no cookie banner is
required at all. A complete mirror of the old site is archived before it is switched off, and
is the record of anything not carried over. The club site lives in **its own repository**:
the CMS grants non-developers write access, which must not reach the code handling the roster,
payments or sessions.

That repository now exists, checked out beside this one as `../club-website`, and carries the
site's spec, its eleven tickets and a copy of this decision as its own ADR 0001. This record
stays here because it is also a **scope** decision about Ricambi — it is why the archive shares a
VPS with a site it shares no code with — and because ADR 0008 refers to it.
