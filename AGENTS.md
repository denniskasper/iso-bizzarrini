# AGENTS.md

Guidelines for AI agents working in this repository.

## Security

- **Never** leak or commit sensitive information, including:
  - Client names
  - Admin names
  - Passwords, tokens, and API keys
  - Environment details (hostnames, URLs, infrastructure configuration)
- Use placeholders (for example, `<CLIENT>`, `<ADMIN_USER>`) when an example needs one of the values above.

## Commits

- Use [Conventional Commits](https://www.conventionalcommits.org/) with a short subject line.
- Format: `<type>(<optional scope>): <description>`
- Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- **The type and a `!` decide the Version** (ADR 0016, `docs/operations/releases.md`): `fix`
  moves the last part, `feat` the middle, a `!` the first. `docs`, `ci`, `chore`, `test` and
  `refactor` move nothing. Pick the type for what somebody outside the repository can notice.
- **A `feat` or `fix` subject is published** in `CHANGELOG.md` and on the GitHub release, so the
  Security rules above apply to it twice over.

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

### Triage labels

The five canonical triage roles, each a GitHub label of the same name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## UI and design

- **Always use the `/frontend-design` skill** for any UI or design work — new components, pages, layout, styling, or beautifying existing screens.
- **Direction for Ricambi**: the Club's own identity, rendered with Apple's restraint and Google's plainness. Graphite, body type and logo treatment come from the Club website so the two properties read as one organisation; the accent pair (champagne for what is pressed, ice blue for what points) and the condensed display lettering are Ricambi's own (ADR 0014). From Apple: the drawing is the hero and the interface recedes — generous whitespace, large confident type, a restrained palette, chrome that stays out of the artwork's way. From Google: tools are plain and unambiguous — one dominant action per screen, high contrast, dense information presented calmly, no decoration on anything functional.
- **Built for a garage**: high contrast in poor light, touch targets usable with cold hands, legible at arm's length on a phone.
- Design tokens are defined once and consumed everywhere. No ad-hoc colour, spacing or type values in feature code.
- Ricambi is English. The Club website is German. Neither borrows the other's language.
