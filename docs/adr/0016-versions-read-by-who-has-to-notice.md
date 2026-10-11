# Versions are read by who has to notice, and the archive runs only Releases

Ricambi carries one Version, in the three parts of semantic versioning, shown in the footer of
every screen. Semantic versioning is defined for a library with a public API and Ricambi has
none, so the three parts are given a meaning of their own — by who has to notice:

- **The last** moves when something that was wrong is now right. Nobody has to learn anything.
- **The middle** moves when a Member, an Editor or an Administrator can do something they could
  not do before.
- **The first** moves when somebody has to act or relearn: whoever runs the platform must do
  something by hand to upgrade, or something people relied on has gone or moved.

That is the reading the commit messages already carry — `fix`, `feat`, and a `!` — so the number
is computed from them rather than chosen. `docs`, `ci`, `chore`, `test` and `refactor` move
nothing, because nobody outside the repository can notice them.

## What the number is for

To say which Ricambi somebody is looking at, when an Administrator relays a problem or a
deployment is being checked. It is not an announcement. A member-facing account of what changed
would be a feature with editorial questions of its own, and this is not it: the Version is plain
text in the smallest type on the page, and it links nowhere.

There is one, for the whole platform. The workspace is three packages and one image (ADR 0008),
and a version per package would describe a distinction nobody outside the repository can observe.

## A Release is deliberate

Merging to `main` does not make a Version. A Release is cut on purpose, and covers whatever has
been merged since the last one. The alternative — a Version per merge — produces seven numbers on
a busy day, none of which anybody chose, and a first part that can be spent by accident.

So work that is merged but not released still carries the Version of the Release it descends
from, and the footer says which commit it is as well: `0.4.0 · a86c067`. The Version says where
the build comes from; the commit says exactly what it is. A count of commits past the Release
would read better and cannot be had, because the preview is built from a checkout one commit
deep.

## The archive runs only Releases

The preview runs `main`, and is where unreleased work is shown. The members' archive (ADR 0009)
runs a Release and nothing else. That is the rule that makes the number worth reading: in
production `1.3.0` means exactly one thing, and "go back to 1.2.4" is a sentence somebody can
say and somebody else can carry out.

Both are deployed by something that follows the head of a branch and cannot be pointed at a tag.
So there is a `release` branch that only ever stands on the latest Release, moved there when a
Release is cut, and the archive follows that branch as the preview follows `main`. Going back is
moving the branch to an older Release and deploying.

## 1.0.0 is the day the archive opens

Until then Ricambi is `0.x`, which in semantic versioning means anything may change — true of a
preview full of invented cars. `1.0.0` is cut by hand on the day real members' data lands, and is
never reached by accident: before it, a change that would move the first part moves the middle
one instead.

The count starts at `0.1.0`, declared where `main` stood when this was decided. The history
before that was not written under this rule and is not back-filled into the changelog; git has
all of it.

## Consequences

- **A commit's type is now load-bearing.** A `feat` that is really a `chore` moves the middle
  part for nothing, and a breaking change without its `!` ships as though nobody had to act.
  The changelog is generated from commit subjects, so the Security rules in `AGENTS.md` apply to
  them with more force than before: a subject is published twice.
- **The image is told its commit; it does not find it.** Nothing environment-specific is baked
  in by accident (the `Dockerfile`'s own promise), so the commit arrives from whatever builds the
  image, and a build that was told nothing shows the Version alone rather than guessing.
- **The Version is reported by the API**, beside the environment, the database and the time —
  what the server says about itself, not what a browser cached. Unlike the DEMO band (ADR 0012)
  nobody's trust depends on it before first paint, so it may arrive with a request.
- **The archive's deployment has to be able to name a Release.** Whatever deploys the members'
  archive, "deploy `main`" is not one of the things it may be asked to do.
