# Releases

How Ricambi gets a new Version, and how the members' archive comes to run it
([ADR 0016](../adr/0016-versions-read-by-who-has-to-notice.md)). A **Release** is cut on purpose
and covers whatever was merged since the last one; merging to `main` on its own makes nothing.

The Version is written in the root `package.json` and nowhere else. The three workspace
packages stay at `0.0.0`. The footer of every screen and `GET /api/status` both report it, with
the commit the image was built from: `0.4.0 · a86c067`.

## What each part of the number means

Read by who has to notice:

| Part | Moves when | Moved by a commit of type |
| --- | --- | --- |
| The last, `0.4.1` | Something that was wrong is now right. Nobody has to learn anything | `fix` |
| The middle, `0.5.0` | A Member, an Editor or an Administrator can do something they could not before | `feat` |
| The first, `2.0.0` | Somebody has to act or relearn: whoever runs the platform must do something by hand to upgrade, or something people relied on has gone or moved | a `!`, as in `feat(31)!: …` |

`docs`, `ci`, `chore`, `test` and `refactor` move nothing, and appear nowhere in the changelog:
nobody outside the repository can notice them. A Release with only those behind it is never
offered.

**While Ricambi is `0.x`, a `!` moves the middle part.** `0.x` means anything may change, which
is true of a preview full of invented cars, and `1.0.0` is reserved for the day the archive
opens. It is never reached by accident.

So the type of a commit, and its `!`, decide the number — and its subject is published, in the
changelog and on the GitHub release. The Security rules in `AGENTS.md` apply to a subject twice
over.

## How a Release is cut

[`.github/workflows/release.yml`](../../.github/workflows/release.yml) runs
[release-please](https://github.com/googleapis/release-please) on every push to `main`. It keeps
**one standing pull request**, titled with the next Version, whose diff is that Version in
`package.json` and `.release-please-manifest.json` and the new entries in `CHANGELOG.md`. Every
merge to `main` brings it up to date.

To cut a Release, **merge that pull request.** The workflow then:

1. tags the merge `vX.Y.Z` and creates the GitHub release, with the same entries;
2. moves the `release` branch to that tag (below).

Merging it is the whole act. Do not edit `CHANGELOG.md` or the Version by hand; the next
release pull request is computed from them. `CHANGELOG.md` is generated, so Prettier leaves it
alone — a Release cannot turn `main` red.

The configuration is [`release-please-config.json`](../../release-please-config.json). It counts
from `0.1.0`, declared where `main` stood when this was decided. The history before that was not
written under this rule and is not in the changelog; git has all of it.

### Why the release pull request shows no checks

The workflow opens it with its own token, and GitHub runs no workflows for what that token does.
So CI does not run on the release pull request, and that is accepted: it touches only the
Version and the changelog. Merging it is a push to `main`, and CI runs on that before the
preview deploys, exactly as for any other merge.

### Once, by a person

The repository has to let the workflow open that pull request: **Settings → Actions → General →
Workflow permissions → "Allow GitHub Actions to create and approve pull requests"**. Without it
the workflow fails, saying so, and no release pull request appears.

## The archive runs only Releases

The preview follows `main` and is where unreleased work is shown. The Club's stack follows the
`release` branch, which **only ever stands on the latest Release**: the release workflow moves it
to the new tag when a Release is cut, and nothing else moves it. Dokploy deploys the head of a
branch and cannot be pointed at a tag, so this branch is how the rule is kept.

Deploying a Release to the archive is then what [`club-deployment.md`](club-deployment.md) says:
a person presses Deploy, and checks the footer reads the new Version.

**Going back** is moving `release` to an older tag and deploying:

```sh
git fetch --tags origin
git push --force origin 'v1.2.4^{commit}:refs/heads/release'
```

Then press Deploy on the Club's stack, and check its footer reads `1.2.4`. A schema migration
is not undone by this: read the changes between the two Releases before going back over one.
The next Release moves `release` forward again.

## The commit in the footer

The image is told the commit it was built from; it never works it out (ADR 0016). Either as the
build argument `COMMIT`, or from the checkout's `.git`, which both Compose files hand to the
build as a second context named `git`. Dokploy builds from a fresh clone and leaves `.git` beside
the checkout, so a deployment from Dokploy knows its commit. `.git` never enters the main build
context.

A build given neither — CI's `image` job, a `docker build .` by hand — shows the Version alone,
and so do `pnpm dev` and the test suites. That is not a fault.

## 1.0.0, on the day the archive opens

`1.0.0` is cut by hand, on the day real members' data lands, and never by a commit's type. On
that day, on a branch of its own, make one empty commit that says so:

```sh
git commit --allow-empty -m "chore: release 1.0.0" -m "Release-As: 1.0.0"
```

Open a pull request and merge it as this repository merges everything, with a merge commit, so
the `Release-As` line reaches `main` intact. The release pull request now proposes `1.0.0`;
merge that, and deploy the archive from `release`. The line applies once: the Release after it
is computed from the commits again.

From `1.0.0` on, a `!` moves the first part, as the table above says.
