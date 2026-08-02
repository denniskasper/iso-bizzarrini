# 23 — Category filters

**What to build:** A member can go straight to the system of the car they are working on — just
the brakes, just the electrics — within their own car, and across every car in the archive.

This is the honest survivor of the original prototype's numbered category scheme: the *system*
half is genuinely useful, while the per-model half was only ever a workaround for having no Model
entity, and it dissolves now that Models exist.

**Blocked by:** 03 — Model, Tavola, scan ingest and private tiles.

**Status:** ready-for-agent

- [ ] A Model's Tavole can be filtered by Category
- [ ] A Category can be viewed across **all** Models, so the same system can be compared between cars
- [ ] Categories come from a maintained list — Drive Shafts, Differential, Wheels, Front and Rear Suspension, Anti-Roll Bar, Steering, Brakes, Electrical, Exhaust, Cooling, Fuel, Body/Exterior, Interior
- [ ] An Administrator can add to or rename entries in that list without a deployment
- [ ] **No numbering scheme** is introduced — Categories are names, not codes
- [ ] The factory's Sezione, Gruppo and Sottogruppo are displayed on a Tavola as recorded, and remain non-navigable until someone confirms they are consistent across catalogs
- [ ] A Tavola with no Category assigned is still reachable and is not hidden by filtering
- [ ] UI and design work uses the `/frontend-design` skill
