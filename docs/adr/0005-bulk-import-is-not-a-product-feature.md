# Bulk spreadsheet import is a migration, not a permanent feature

The original description called for an admin panel that could upload spreadsheets to
bulk-load and update the parts table at any time. We have deliberately not built that, and a
future reader will otherwise assume it was an oversight.

Once Editors have folded Contributions and corrections into a Part, re-uploading the
spreadsheet that Part came from overwrites them silently, in bulk, with no record of what was
lost. The prototype could do this safely because it had no curated state underneath; this
system will have.

Instead: the initial load is **migration scripts**, versioned in the repository and
re-runnable, run against the existing spreadsheets and scans. A permanent import exists only
for the member roster, which genuinely recurs and has no curated state beneath it. Everything
else is edited through the Editor interface, with bulk-paste per Tavola and spreadsheet export
as the concession to Editors who work most comfortably in Excel.
