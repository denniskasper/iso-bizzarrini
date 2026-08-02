# Stack: Vite + React + shadcn/ui, Express, Drizzle, Postgres

The application is a React single-page app built with Vite, styled with shadcn/ui and
Tailwind, routed and fetched with TanStack Router and Query; the API is Express in
TypeScript with Zod validation and Sentry (EU data region, PII scrubbing on); persistence is
Drizzle ORM on Postgres. **One deployable**, not a service split.

Server-side rendering was not adopted: every page sits behind a login, so there is nothing to
render for an anonymous visitor and no SEO to serve. The public-facing content lives in a
separate static site entirely (see ADR 0010).

## Consequences

This repository previously carried two agent skills documenting a Prisma/Express/MUI house
style. They described a stack this project does not use, and auto-activated on routing,
component and data-fetching work — so they were removed rather than left to give confidently
wrong instructions. **This ADR is now the record of the stack**; there is no other.
