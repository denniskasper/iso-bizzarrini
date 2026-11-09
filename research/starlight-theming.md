# How far can Starlight wear Ricambi's identity?

Research for issue #255 (map #254, Ricambi Docs prototype). Planning only: nothing was built.
Checked on 2026-11-09.

## Answer in short

**Yes, without forking Starlight.** Colours and fonts are custom CSS mapped onto Starlight's
`--sl-*` properties; the wordmark is configuration. Four things need component overrides, all of
them small, and each can wrap Starlight's own component rather than replace it:

| Need | How | Override? |
| --- | --- | --- |
| Teal accent, Ricambi surfaces and text | `customCss` mapping `--sl-color-*` onto Ricambi's semantic tokens | No |
| Open Sans body, IBM Plex Mono code, self-hosted | Fontsource packages in `customCss`, `--sl-font` / `--sl-font-mono` | No |
| Raleway 500 headings | A heading rule in the same custom CSS | No |
| Club wordmark in the header | `logo: { src, replacesTitle }` | No |
| Graphite header in light mode | Mapping CSS, plus a `Header` wrapper if `.chrome` is reused | Optional: `Header` |
| Graphite footer | Starlight's `Footer` sits inside the content column | **Yes: `Footer`** (or `PageFrame` for full width) |
| **Light by default** whatever the OS says | Starlight falls back to `prefers-color-scheme` | **Yes: `ThemeProvider`** |
| Dark **one press** away | Starlight ships a three-way select (dark/light/auto) | **Yes: `ThemeSelect`** |
| Sidebar "coming" entries that are not pages | Badge and `attrs` on a link item get close; a true non-link needs `Sidebar` | Optional: `Sidebar` |

Pagefind search is fully static. Current versions: **Astro 7.4.7, Starlight 0.42.10**, which need
**Node 22.23.4 or later**. The root `build` is untouched, root `dev` would start the docs
too, root `typecheck` only runs if `apps/docs` declares a `typecheck` script, and root `lint` needs
`**/.astro/**` ignored.

Sources: Starlight's repository at commit `5a061c1` (main, 2026-11-06), cited by path as
`starlight:<path>`; Starlight's docs live in the same repository under `docs/src/content/docs/`.
Versions and engines are from the npm registry manifests (`registry.npmjs.org/<pkg>/latest`).
Repository files are cited by path.

---

## 1. Can Starlight consume `tokens.css` directly?

**Not as it stands. It needs a mapping file, which can import the token values instead of copying them.**

- `apps/web/src/styles/tokens.css` is **Tailwind v4 source**, not plain CSS: it opens with
  `@custom-variant dark (...)` and names its utilities in an `@theme inline { ... }` block. Only
  Tailwind's compiler understands those. The raw custom properties (`--surface`, `--text`,
  `--accent`, `--accent-ink`, the `--type-*` step and so on, in `:root` and in `.dark, .chrome`) are
  plain CSS and would work in any stylesheet.
- **Starlight does not read those names.** Its UI reads its own `--sl-*` properties, declared in
  `@layer starlight.base` (`starlight:packages/starlight/src/style/props.css`). The layer order is
  `starlight.base, starlight.reset, starlight.core, starlight.content, starlight.components, starlight.utils`
  (`starlight:packages/starlight/src/style/layers.css`). Unlayered custom CSS therefore beats all
  of it without `!important` (docs: `guides/css-and-tailwind.mdx`, "Cascade layers").
- **Dark mode uses a different selector.** Ricambi's dark theme is the `.dark` class. Starlight
  writes `data-theme="light"|"dark"` on `<html>` and keys its light values on
  `:root[data-theme='light']` (`props.css`; `components/ThemeProvider.astro`).
- **Starlight's naming flips with the theme.** In light mode `--sl-color-white` is the *darkest*
  ink and `--sl-color-black` the page background (`props.css`, light block). Map by role, not by name.

### Starlight's properties (from `props.css`)

- **Greys:** `--sl-color-white`, `--sl-color-gray-1` … `-gray-6` (`-gray-7` in light only), `--sl-color-black`.
- **Accent:** `--sl-color-accent-low`, `--sl-color-accent`, `--sl-color-accent-high`.
- **Roles:** `--sl-color-text`, `--sl-color-text-accent` (links; also the fill of the current
  sidebar item), `--sl-color-text-invert` (text on that fill), `--sl-color-bg`, `--sl-color-bg-nav`
  (header), `--sl-color-bg-sidebar`, `--sl-color-bg-inline-code`, `--sl-color-bg-accent`,
  `--sl-color-hairline-light`, `--sl-color-hairline`, `--sl-color-hairline-shade`,
  `--sl-color-backdrop-overlay`.
- **Status hues** (asides, badges): `--sl-color-{orange,green,blue,purple,red}{-low,,-high}` and `--sl-hue-*`.
- **Type:** `--sl-font` and `--sl-font-mono` (each falls back to a system stack), `--sl-text-2xs` …
  `--sl-text-6xl`, `--sl-text-body`, `--sl-text-h1` … `-h5`, `--sl-line-height`,
  `--sl-line-height-headings`.
- **Layout:** `--sl-nav-height`, `--sl-nav-pad-x/y`, `--sl-sidebar-width`, `--sl-content-width`,
  `--sl-content-pad-x`, `--sl-menu-button-size`, and the z-indices.
- **Shadows:** `--sl-shadow-sm/md/lg`.

### Recommended mapping approach

One file, `apps/docs/src/styles/ricambi.css`, in `customCss`:

1. **Get the values without copying them.** Import the token values from `apps/web` (a relative
   path or a workspace package export). Two ways to do it:
   - **Through Tailwind** (`@tailwindcss/vite` plus `@astrojs/starlight-tailwind` 5.0.0, the route
     Starlight's docs give). `tokens.css` then compiles as it does in `apps/web`. The Starlight
     Tailwind bridge (`starlight:packages/tailwind/tailwind.css`) only knows
     `--color-accent-50…950`, `--color-gray-50…950`, `--font-sans` and `--font-mono`. Ricambi's tokens
     are semantic, not eleven-step scales, so the `--sl-*` mapping below is still needed. The bridge
     adds little here.
   - **Plain CSS** (no Tailwind in `apps/docs`). Browsers drop the unknown `@custom-variant` and
     `@theme` at-rules and keep the custom properties, but Vite's CSS pipeline may warn on them.
     Splitting `tokens.css` into a plain `tokens.values.css` (the `:root` and `.dark, .chrome`
     blocks), imported by both apps, is cleaner. It is a small change to `apps/web`, and it keeps
     "defined once".
2. **Let the `.dark` block apply as it is.** The `ThemeProvider` override (section 3) toggles the
   class `dark` on `<html>` alongside Starlight's `data-theme`. Then `tokens.css`'s own
   `.dark, .chrome` block supplies the dark values and the mapping needs no dark copy.
3. **Map by role**, once, on `:root`, with no `data-theme` qualifier, because the Ricambi variables
   already change underneath:

   | Starlight | Ricambi |
   | --- | --- |
   | `--sl-color-bg`, `--sl-color-black`, `--sl-color-bg-sidebar` | `--surface` |
   | `--sl-color-bg-inline-code`, `--sl-color-gray-6`, `--sl-color-gray-7` | `--surface-sunken` |
   | `--sl-color-white`, `--sl-color-gray-1` (headings, strong ink) | `--text` |
   | `--sl-color-text`, `--sl-color-gray-2` (body) | `--text` or `--text-muted` (prototype decides) |
   | `--sl-color-gray-3` (dim text, TOC) | `--text-faint` |
   | `--sl-color-gray-4` | `--line-strong` |
   | `--sl-color-gray-5`, `--sl-color-hairline*` | `--line` |
   | `--sl-color-accent` | `--accent` |
   | `--sl-color-text-accent`, `--sl-color-accent-high` | `--accent-ink` (**not** `--accent`: the fill is 3.2:1 as text on white) |
   | `--sl-color-text-invert` | `--accent-contrast` |
   | `--sl-color-accent-low` | `color-mix(in oklch, var(--accent) 15%, var(--surface))` |
   | `--sl-color-bg-accent` | `--accent` |
   | `--sl-color-red*` | `--alarm` |
   | `--sl-font` / `--sl-font-mono` | `--font-sans` / `--font-mono` values |

   **The current sidebar item** is filled with `--sl-color-text-accent` under
   `--sl-color-text-invert` (`components/SidebarSublist.astro`). With the mapping above it comes
   out darkened teal under graphite ink. For the Club's exact teal fill, as in Ricambi, add one rule
   on `nav.sidebar a[aria-current='page']` with `--accent` behind `--accent-contrast`. The
   other status hues (orange, green, blue, purple for asides) have no Ricambi token. Either leave
   Starlight's or add tokens deliberately; the Mark's ultramarine must not be reused for them.

## 2. Teal, graphite frame, Raleway over Open Sans, self-hosted?

**Yes.**

- **Teal:** `--sl-color-accent` and `--sl-color-text-accent`, as mapped above.
- **Fonts, self-hosted:** Starlight itself loads no web fonts. It defaults to system stacks
  (`props.css`, `--sl-font-system`), and no Google Fonts host appears anywhere in
  `packages/starlight/src`. The docs' "Set up a Fontsource font" path puts Fontsource CSS files in
  `customCss`, and those serve the `woff2` from the site's own build (docs:
  `guides/customization.mdx`, "Custom fonts"). Use the packages `apps/web` already uses
  (`apps/web/package.json`, `apps/web/src/styles/global.css`): `@fontsource-variable/open-sans/wght.css`,
  `@fontsource/raleway/latin-500.css`, `@fontsource/ibm-plex-mono/latin-400.css` (and 500/600 if used).
- **Raleway headings need one rule.** Starlight has a single `--sl-font` for everything and sets
  headings at weight 600: in `.sl-markdown-content :is(h1…h6)` (`style/markdown.css`), the page
  title `h1#_top` (`components/PageTitle.astro`) and the splash `Hero` `h1`. Set
  `font-family: var(--font-display); font-weight: 500` on those three selectors, unlayered. Raleway is
  shipped at 500 only, as in `visual-language.md`.
- **Graphite header:** the header is PageFrame's `<header class="header">`, painted with
  `--sl-color-bg-nav` (`components/PageFrame.astro`). Setting that to graphite is one line, but
  in light mode everything inside it (site title, search button, theme control, social icons) is
  drawn in light-mode `--sl-color-white`/`gray-*`, so dark on graphite. Two ways out:
  - CSS only: re-declare the dark values on `.header` (custom properties cascade). **Caveat:**
    the search `<dialog>` is a child of the header (`components/Search.astro`), so it would
    inherit graphite too. Reset it to the page values on `.header dialog`, or accept a dark modal.
  - **`Header` override that wraps the default** in `<div class="chrome">` (docs:
    `guides/overriding-components.mdx`, "Reuse a built-in component"). Ricambi's own `.chrome`
    block then applies as it does in `apps/web`, and nothing is re-declared. The same dialog caveat
    holds. Recommended, because it reuses the token file's own idea of the chrome.
  - The graphite value itself is `--surface-raised` inside `.chrome`. A light-mode page has no
    root token for it, so `.header`'s background has to come from inside a `.chrome` scope, or
    from a new named token (for example `--chrome`) added to the shared values.
- **Graphite footer: needs an override.** Starlight's `Footer` (edit link, last updated,
  pagination, credits) renders *inside the content column*, under the Markdown
  (`components/Page.astro`, `components/Footer.astro`). It is not a full-width page footer.
  - **Override `Footer`**: wrap the default, add a graphite `.chrome` band. It is the column's
    width, which may be enough for a demo.
  - **Full-width footer:** override `PageFrame`, but its sidebar is fixed to the viewport height on
    wide screens (`PageFrame.astro`), so a full-width band needs layout care. A choice for the
    prototype spec.

## 3. Club wordmark in the header; light by default, dark one press away?

**Wordmark: yes, by configuration.** `logo` takes `src` (or a `light`/`dark` pair), `alt` and
`replacesTitle` (`starlight:packages/starlight/src/schemas/logo.ts`; docs: `guides/customization.mdx`,
"Add your logo"). The wordmark is white on transparent and the header is graphite in both themes,
so a single `src` is right: no light/dark pair. Use the retina file (464×108,
`apps/web/public/club/wordmark-retina.png`) from `apps/docs/src/assets/`. `SiteTitle` sizes the image
to the nav height. To keep "Ricambi" beside the wordmark in small type (ADR 0020), leave
`replacesTitle: false` and style the `title` text. To control the lockup exactly, override
`SiteTitle` (optional).

**Light by default: needs a `ThemeProvider` override.** Starlight has no default-theme setting. Its
inline pre-paint script uses `localStorage['starlight-theme']` and otherwise follows
`prefers-color-scheme` (`components/ThemeProvider.astro`). A phone set to dark would get the dark
theme. The override keeps the same inline, no-flash shape, falls back to `light`, and also
toggles `.dark` (section 1). `ThemeProvider` is in the overridable list
(`starlight:packages/starlight/src/schemas/components.ts`).

**One press: needs a `ThemeSelect` override.** The built-in control is a `<select>` with dark,
light and auto (`components/ThemeSelect.astro`). Replace it with one 44px button that flips
light and dark and stores the choice, ideally under the key Starlight's own script reads.
Ricambi's key (`ricambi.theme`, `apps/web/public/theme.js`) lives on a different origin, so the two
cannot share it anyway.

**CSP:** Starlight's theme scripts are inline (`is:inline`). That is fine on a plain static host,
but would break behind a `script-src 'self'` policy like the one the API serves `apps/web` with
(`apps/web/public/theme.js`, header comment). If Ricambi Docs is served with that policy, check
Astro's CSP support first.

## 4. Sidebar entries marked "coming" without being pages?

**Close without an override; exact with one.**

- Every sidebar **link** item needs `link` (a URL string) or `slug` (a real content entry)
  (`schemas/sidebar.ts`, `SidebarLinkItemSchema`, `InternalSidebarLinkItemSchema`). A link item
  can carry a **`badge`** (`variant` among note, danger, success, caution, tip, default, and its own
  `class`) and arbitrary **`attrs`** (`schemas/badge.ts`, `schemas/sidebar.ts`). So, config only:

  ```js
  { label: 'Placing Marks', link: '#coming', badge: { text: 'Coming', variant: 'default' },
    attrs: { 'aria-disabled': 'true', tabindex: '-1', class: 'coming' } }
  ```

  plus CSS on `.coming` (muted, `pointer-events: none`). No page exists, but it is still an
  `<a href>` in the DOM, and it still counts as a sidebar link for prev/next pagination
  (`utils/routing/types.ts`, `PaginationLinks`). Pagination can be turned off per page or globally.
- A **group** item has no link and may hold an empty `items` array (`ManualSidebarGroupSchema`).
  An empty group renders as a `<details>`/`<summary>` header with a badge
  (`components/SidebarSublist.astro`), not a link. That fits a whole *section* that is coming.
  It still shows a disclosure caret that opens onto nothing.
- **Exact:** `SidebarSublist` is internal and cannot be overridden, but **`Sidebar` can**
  (`schemas/components.ts`). It only renders `SidebarSublist` over
  `Astro.locals.starlightRoute.sidebar` (`components/Sidebar.astro`). Override it to render
  entries flagged in `attrs` (for example `data-coming`) as a plain `<span>` with the badge, or
  remove them from pagination in a `routeMiddleware` (docs: `guides/route-data.mdx`). Recommended
  if the "rest of the scope" is meant to read as a plan rather than as dead links.

## 5. Does Pagefind work fully static?

**Yes.** Search is on by default and needs no configuration or service (docs:
`guides/site-search.mdx`). At the end of `astro build`, the integration indexes the output with the
`pagefind` Node API and writes the index into `dist/pagefind/`
(`starlight:packages/starlight/src/integrations/pagefind.ts`). The browser then fetches only static
files. Limits:

- It needs prerendered pages: `pagefind` "cannot be enabled when the `prerender` option is set to
  `false`" (docs: `reference/configuration.mdx`). The default is static, which is what we want.
- It does not work in `astro dev`. The modal shows a dev warning and the index only exists after a
  build (`components/Search.astro`, `import.meta.env.DEV`). Check search with `build` + `preview`.
- `pagefind` 1.6.0 ships its binary as per-platform optional dependencies (`@pagefind/linux-x64` …)
  with no install script, so pnpm's `allowBuilds` needs no new entry for it (npm manifest).

## 6. Versions, Node, and the root scripts

**Versions (npm registry, 2026-11-09):**

| Package | Latest | Requires |
| --- | --- | --- |
| `astro` | 7.4.7 | `engines.node >=22.23.4`; Vite `^8.3.5`; optional `sharp ^0.35.4` |
| `@astrojs/starlight` | 0.42.10 | peer `astro ^7.2.10` (and optional `@astrojs/markdown-remark ^7.3.0`) |
| `pagefind` (Starlight dep) | 1.6.0 | prebuilt binaries via optional deps |
| `@astrojs/check` (for `astro check`) | 0.9.12 | peer `typescript ^5 \|\| ^6` (repo has 5.9) |
| `@astrojs/starlight-tailwind` (only on the Tailwind route) | 5.0.0 | `tailwindcss ^4`, Starlight `>=0.38` |

- **Node:** the repo declares `"node": ">=22"` (root `package.json`). CI and the Dockerfile use Node
  24 (`.github/workflows/ci.yml`, `Dockerfile` `node:24-bookworm-slim`), which satisfies Astro.
  Node 22.0–22.23.3 would not. Raising the root engine to `>=22.23.4` keeps the declaration honest.
- **pnpm 12 workspace:** `apps/*` is already a workspace glob (`pnpm-workspace.yaml`), so
  `apps/docs` joins automatically. Astro's Vite 8 sits beside `apps/web`'s Vite 7 without conflict,
  because pnpm isolates them. `esbuild` is already in `allowBuilds`, and `sharp` 0.35 ships
  prebuilt binaries with no install script (npm manifest).

**The root scripts (`package.json`):**

- `build`: **unaffected.** It filters `@ricambi/web` and `@ricambi/api` by name. The docs build is
  its own command (`pnpm --filter <docs package> build`) and only joins `build` if we choose.
- `dev`: **affected.** `pnpm --parallel --filter "./apps/*" dev` would start the docs' `dev` too.
  Either filter it out, or name the docs script differently. Dev servers on the box go through
  devctl anyway (agent rules).
- `typecheck`: `pnpm -r typecheck` runs a package's script **only if it has one**. Without it the
  docs are skipped. Adding `"typecheck": "astro check"` (with `@astrojs/check` and `typescript`)
  brings them into CI's `pnpm typecheck`. The docs need their own `tsconfig.json` extending
  `astro/tsconfigs/strict`, not `tsconfig.base.json` (NodeNext, no DOM lib).
- `lint`: `eslint .` will lint `apps/docs`'s `.ts`/`.mjs` files (`astro.config.mjs`, any route
  middleware) under the shared config (`eslint.config.js`). It will also lint Astro's generated
  `apps/docs/.astro/*.d.ts` unless `**/.astro/**` joins `ignores`: those files use triple-slash
  references, which `typescript-eslint`'s recommended set flags. `.astro` components are not linted
  (no `eslint-plugin-astro`), which is acceptable for a prototype.
- `format:check`: **unaffected, and for a surprising reason.** `.prettierignore` has `docs/`, which
  in gitignore syntax matches a `docs` directory at any depth. So `apps/docs/` is skipped
  entirely, which also avoids Prettier tripping over `.astro` and MDX. Decide whether that is
  wanted, or anchor the pattern as `/docs/`.
- `.gitignore` needs `.astro/` (Astro's generated types). `dist/` and `node_modules/` are already
  covered.
- **Docker image:** the `dependencies` stage copies only the three existing `package.json`s, then
  runs `pnpm install --frozen-lockfile` (`Dockerfile`). Once the lockfile carries an `apps/docs`
  importer whose manifest is not copied, check that the install still passes. **Not verified here.**
  Copying `apps/docs/package.json` too, or using `pnpm fetch`, are the usual remedies. `COPY apps
  ./apps` will also carry the docs source into the build stage, which is harmless.

## Overrides, in the order a build ticket would meet them

1. `ThemeProvider`: light fallback, `.dark` class. **Required** by "light by default".
2. `ThemeSelect`: one-press toggle. **Required** by "one press away".
3. `Footer` (or `PageFrame`): graphite footer. **Required** by "graphite header and footer".
4. `Header`: `.chrome` wrapper. Optional; CSS alone can do it.
5. `Sidebar`: true non-link "coming" entries. Optional; badge plus `attrs` can do it.
6. `SiteTitle`: exact wordmark and "Ricambi" lockup. Optional.

All are listed as overridable in `schemas/components.ts`, and each can import and wrap
`@astrojs/starlight/components/<Name>.astro`, so Starlight is never forked.
