# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the "Label in our tracker" column to match whatever vocabulary you actually use.

## What `ready-for-agent` promises here

The Sandcastle runner takes every open `ready-for-agent` issue that is not a `spec`, whenever
nothing else is ready. So the label means more than "fully specified": **an agent in the sandbox
can do the work and check it there.** The sandbox runs the typecheck, lint, format check and the
API tests, against its own Postgres. It cannot run the browser suite.

An issue whose diagnosis or proof needs the browser suite, a person's judgment, an outside
account or the real deployment is `ready-for-human`, however well it is written. A ticket whose
change shows in the browser is still `ready-for-agent` when its behaviour can be pinned at the
API seam and the browser test only follows it, since CI runs that test before anything merges.
