# AGENTS.md

Guidelines for AI agents working in this repository.

## Security

- **Never** leak or commit sensitive information, including:
  - People's names and addresses: the Club's officers, administrators and members
  - Passwords, tokens, and API keys
  - Environment details (hostnames, URLs, infrastructure configuration)
- Use placeholders (for example, `<CLUB_CHAIR>`, `<ADMIN_USER>`) when an example needs one of the values above.
- **The Club's identity is not sensitive** (ADR 0020): its name, logo, emblem, colours and its
  public website's address may be committed and published. It is the people and the
  infrastructure that stay out.

## Commits

- Use [Conventional Commits](https://www.conventionalcommits.org/) with a short subject line.
- Format: `<type>(<optional scope>): <description>`
- Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- **The type and a `!` decide the Version** (ADR 0016, `docs/operations/releases.md`): `fix`
  moves the last part, `feat` the middle, a `!` the first. `docs`, `ci`, `chore`, `test` and
  `refactor` move nothing. Pick the type for what somebody outside the repository can notice.
- **A `feat` or `fix` subject is published** in `CHANGELOG.md` and on the GitHub release, so the
  Security rules above apply to it twice over.
- **A pull request's title is not a commit subject**, and does not begin with a type: write
  "Members can renew by card", not "feat: members can renew by card". The title ends up in the
  merge commit, where a typed one is counted as one more change. CI refuses it.

Examples:

```
feat(auth): add session refresh
fix: handle empty response body
docs: update setup instructions
```

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in this repository, worked through the `gh` CLI. See `docs/agents/issue-tracker.md`.

The Security rules above still apply to issue titles, bodies and comments: use placeholders such as `<CLIENT>` rather than real names.

### Sandcastle

The runner copies its own output to `.sandcastle/logs/run.log`, next to each agent's log, and
appends to it on every run. Follow a run started in the background with
`tail -F .sandcastle/logs/run.log`. Never redirect its output to a shared path such as
`/tmp/sandcastle-run.log`: other repositories' runners on the same machine pick the same name and
overwrite it.

### Triage labels

The five canonical triage roles, each a GitHub label of the same name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## UI and design

- **Always use the `/frontend-design` skill** for any UI or design work — new components, pages, layout, styling, or beautifying existing screens.
- **Direction for Ricambi**: the Club website's identity, rendered with Apple's restraint and Google's plainness (ADR 0020). From the Club website, as it is live today: the teal as the one accent, a white page in a graphite header and footer (light by default, dark one press away), Raleway headings, Open Sans for everything read, and the Club's own wordmark in the header, so members recognise the archive as the Club's. Marks on a drawing keep a colour of their own, chosen for the paper, never the accent. From Apple: the drawing is the hero and the interface recedes — generous whitespace, large confident type, a restrained palette, chrome that stays out of the artwork's way. From Google: tools are plain and unambiguous — one dominant action per screen, high contrast, dense information presented calmly, no decoration on anything functional. The website's page layouts are not copied: the screens stay drawing-first.
- **Built for a garage**: high contrast in poor light, touch targets usable with cold hands, legible at arm's length on a phone.
- Design tokens are defined once and consumed everywhere. No ad-hoc colour, spacing or type values in feature code.
- Ricambi is English. The Club website is German. Neither borrows the other's language.
