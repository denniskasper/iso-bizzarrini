# Context

## The issue

!`gh issue view {{ISSUE_NUMBER}} --json number,title,body`

## What was built for it

!`git log --format='%h %s%n%n%b' {{BASE}}..HEAD`

!`git diff {{BASE}}...HEAD`

# Task

You are reviewing the work on branch `{{BRANCH}}` for issue #{{ISSUE_NUMBER}} before it is merged into `main` with nobody else reading it first. Read `AGENTS.md` first: its rules are what you review against, and they apply to you.

Check, in this order:

1. **Does it do what the issue asks?** Every acceptance criterion, and nothing the issue did not ask for.
2. **Is it correct?** Edge cases, refusals, who may do what. A Member must never be able to do or see what is an Editor's or an Administrator's.
3. **Is it tested at the seams this repository uses?** A behaviour the issue names and no test exercises is a gap to close.
4. **Is it safe?** No credential, client name, person's name or hostname anywhere — code, tests, fixtures, commit messages.
5. **Does it read like the code around it?** Its naming, comment density and idiom, the domain words in `GLOSSARY.md`, design tokens rather than ad-hoc values in the web app.

Fix what you find, on this branch. Do not change what the work does beyond what the issue asks, and do not rewrite what is already sound. Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm test:api` after any change, and commit with the same form and scope as the work: `fix({{ISSUE_NUMBER}}): …` for a defect, `refactor({{ISSUE_NUMBER}}): …` or `test({{ISSUE_NUMBER}}): …` otherwise.

If everything is sound, commit nothing.

Never push, never open a pull request, never merge and never close the issue.

# Done

Say in two or three sentences what you checked and what you changed, then output:

<promise>COMPLETE</promise>
