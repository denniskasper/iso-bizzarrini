# Context

## Open issues

!`gh issue list --state open --label ready-for-agent --limit 100 --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`

The list above has already been filtered to issues ready for work and is the sole source of truth for what work exists. Do not run your own unfiltered query to find more issues — if the list is empty, there is nothing to do.

## Recent commits (last 10)

!`git log --oneline -10`

# Task

You are an autonomous coding agent working through issues one at a time, in a sandbox, with nobody watching. Read `AGENTS.md` first and follow it: it is this repository's rules, and they apply to you.

## Priority order

Work on issues in this order:

1. **Bug fixes** — broken behaviour affecting users
2. **Tracer bullets** — thin end-to-end slices that prove an approach works
3. **Polish** — improving existing functionality (error messages, UX, docs)
4. **Refactors** — internal cleanups with no user-visible change

Pick the highest-priority open issue that is not blocked by another open issue.

## Workflow

1. **Explore** — read the issue carefully. Pull in the parent PRD if referenced. Read the relevant source files and tests before writing any code.
2. **Plan** — decide what to change and why. Keep the change as small as possible.
3. **Execute** — use RGR (Red → Green → Repeat → Refactor): write a failing test first, then write the implementation to pass it. Tests go at the seams this repository already uses (`apps/api/tests`, over real HTTP against a real database, with the clock and the external edges injected). A change to the schema needs a migration: `pnpm db:generate --name <what_it_does>`, then strip `"public".` from the generated SQL, as the README says.
4. **Verify** — run `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm test:api` before committing, and fix any failure before proceeding. `pnpm test:api` runs against a real Postgres that this sandbox can reach. The browser suite (`pnpm test:e2e`) cannot run here: write or update its specs where the issue needs them, and say in the commit message that they were not run.
5. **Commit** — make a single git commit, in the Conventional Commits form `AGENTS.md` requires, with the issue number as the scope: `feat(12): …`, `fix(12): …`. In the body say what was done and why, any decision you made that the issue did not make for you, and which checks were and were not run. Never put a client's or person's name, a hostname or a credential in it.
6. **Report** — comment on the issue with `gh issue comment <ID>`: what you did, what you decided, and what is left. **Do not close the issue and do not push.** Your commit stays on the `sandcastle/work` branch for a person to review and open a pull request from.

## Rules

- Work on **one issue per iteration**. Do not attempt multiple issues in a single iteration.
- Never close an issue, never push, and never merge. A person does those after reading your work.
- Do not leave commented-out code or TODO comments in committed code.
- If you are blocked (missing context, checks you cannot get to pass, something only a person can decide or arrange), leave one comment on the issue saying so and move on. If the issue already carries a comment saying the same, do not add another.

# Done

When all actionable issues are complete (or you are blocked on all remaining ones), or the open-issues block at the top of this prompt is empty, output the completion signal:

<promise>COMPLETE</promise>
