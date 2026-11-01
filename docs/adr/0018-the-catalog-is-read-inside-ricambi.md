# The catalog is read inside Ricambi, by its Administrators

The catalog is the Club's, and so are the money spent reading it, the credential that pays and
the record of what was spent. A command run on one person's computer, whose output somebody with
server access then loads into the deployed archive, keeps all of that away from the Administrators
who look after the archive. So the catalog is read inside Ricambi: an Administrator uploads the
catalog, sees the estimate, sets a limit and starts a **Catalog run** on the server, and each
Tavola it finishes arrives in the archive as Unchecked.

This replaces two parts of ADR 0017 and drops a third. Everything else in it stands: reading every
Table sheet twice, doubts, assigning a sheet to the Tavola printed on it, Unchecked and Published,
publishing as a person's act, the estimate, the limit with no default and the cost record.

**"It is a command, not a screen" is replaced.** Reading happens in Ricambi, started, raised,
continued and stopped by Administrators only; Editors check and publish, as before, and Members
never see a run, its cost or the uploaded catalog. The run takes minutes per sheet, so it runs on
the server in the background and survives the page being closed and the server restarting. The
command stays, as a developer tool built on the same reading code.

**"It starts on the subscription ... and moves to an API key" is replaced.** The server reads with
the one credential it is configured with, as a secret: a subscription login while Ricambi is a
prototype, and the Club's own API key once the Club has one (amended below: a server reads only
with an API key). Switching is a configuration change, not a code change. Neither or both
configured means no run can start, and Ricambi says why.

**Amended 2026-11-01 (issue #151): a server reads only with an API key.** The subscription login
stays on the developer's machine, for Development, through the Agent SDK and the Claude Code
login already there; a server refuses to start with it, and its image no longer carries Claude
Code. Integration reads with its own key, and Production reads only once the Club has its own.
Until then Production cannot read, which is a configuration that says why, not a fault. The rule
is set out for every use of Claude in ADR 0012, as amended.

**The Excel correction step is dropped.** Every correction to a Tavola is made in Ricambi, on the
checking screen, so there is one place where what a Tavola says can change. A doubt is cleared or
rewritten there instead of in the spreadsheet.

## Considered Options

**Keep the command, and give Administrators server access.** Rejected: the people who will look
after the archive are not the people who run servers, and the spending would still happen outside
the Club's view.

**Choose the credential per run in the screen.** Rejected: it would put a second credential on
the server and a decision about whose account pays in front of every Administrator. One configured
credential means a run cannot be paid for by the wrong one.
