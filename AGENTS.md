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

Examples:

```
feat(auth): add session refresh
fix: handle empty response body
docs: update setup instructions
```

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

`.scratch/` is committed on purpose — do not add it to `.gitignore`. The Security rules above still apply to its contents: use placeholders such as `<CLIENT>` rather than real names.

### Triage labels

The five canonical triage roles, used verbatim as `Status:` values. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
