# Context

## Issues that can be started

These are open `ready-for-agent` issues whose "Blocked by" issues are all closed, and which have no pull request open already. Specs are left out.

<issues-json>
{{CANDIDATES}}
</issues-json>

## Recent commits

!`git log --oneline -15`

# Task

Read `AGENTS.md`, then choose which of the issues above can be built **at the same time**, each on its own branch cut from `main`, without the branches colliding when they are merged one after the other.

Two issues collide when:

- both change the database schema — each would generate a migration with the same number, and the second can only be merged after its migration is regenerated;
- they would change the same files or the same module in ways a merge cannot reconcile;
- one needs a decision, an API shape or code that the other introduces.

Read the code each issue would touch before deciding; do not judge from titles. When two issues collide, choose the one more issues depend on, then the one that fixes broken behaviour, then the lower number. The rest wait for a later round.

Change nothing and commit nothing: this is reading only.

# Output

Emit the plan as JSON inside `<plan>` tags, with a one-line reason per issue chosen and per issue left out:

<plan>
{"issues": [{"number": 109, "reason": "schema change; nothing else this round touches the schema"}], "deferred": [{"number": 111, "reason": "also changes the schema"}]}
</plan>

Always emit the tags. If none of the issues can be started, emit `<plan>{"issues": [], "deferred": []}</plan>`.
