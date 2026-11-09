# How is a static Ricambi Docs served beside Integration?

Research for issue #256 (map #254). Planning only: nothing was deployed. Written 2026-11-09 against
Dokploy v0.31.0 (latest release at the time) and this repository at `bd89bc2`.

Placeholders: `<DOCS_HOST>` is the docs site's own subdomain, `<DOKPLOY_HOST>` the panel's
address, `<APP_HOST>` the address Integration or the preview is reached at.

## Recommendation

**A Dokploy Application with the Dockerfile build type**, building `apps/docs/Dockerfile` with the
repository root as its context: a two-stage image (Node + pnpm builds Starlight into `dist/`,
`nginx:alpine` serves it on port 80). Attach `<DOCS_HOST>` in the Application's Domains tab with
HTTPS and Let's Encrypt. **Redeploy it from GitHub Actions** on a push to `main` that touches
`apps/docs/**`, by calling Dokploy's `application.deploy`, the same way `ci.yml` already calls
`compose.deploy` for the preview. Don't rely on Dokploy's own autodeploy or watch paths.

It touches nothing in the Ricambi stack: it is a separate Dokploy service with its own container,
image and hostname, and no database, volume or environment of the app's. One side effect needs a
check in the build ticket (see "Watch out for", item 1).

## The three options

| | Dokploy static application | Own nginx/Caddy image (Application, Dockerfile build type) | Separate Compose service |
| --- | --- | --- | --- |
| Builds the Astro site? | **No.** Copies a directory into `nginx:alpine` as it is [S1, S2] | Yes, in the image's first stage | Yes, the same Dockerfile, run by Compose |
| Monorepo (root `pnpm-lock.yaml`, tokens in `apps/web`) | n/a | Works: context `.`, Dockerfile path `apps/docs/Dockerfile` [S1, S4] | Works: `build.context: ../..` |
| Rebuilt on merge | CI calls `application.deploy` [S3] | CI calls `application.deploy` [S3] | CI calls `compose.deploy` (as `ci.yml` does today) |
| Own subdomain | Domains tab, port 80 [S1, S5] | Domains tab, port 80 [S5] | Domains tab on the Compose service; Dokploy writes Traefik labels into the file at deploy time [S6] |
| Touches the Ricambi stack? | No | No | No, **as long as it is its own Compose service** and not a service added to `docker/preview/compose.yml` |
| Files added to the repo | none, but needs a built `dist/` from somewhere | `apps/docs/Dockerfile` (+ `nginx.conf` if wanted) | the same, plus `docker/docs/compose.yml` |

### 1. Dokploy static application: ruled out as it stands

Dokploy's docs say the Static build type "will use a NGINX Optimized Dockerfile to run your
application", copying the root directory into NGINX's html directory, port 80 [S1]. The source
confirms it never builds anything: it writes a Dockerfile of `FROM nginx:alpine` and
`COPY ${publishDirectory || "."} .`, then hands it to the Dockerfile builder [S2, `static.ts`].
An Astro site would have to be built somewhere else and its `dist/` committed, which nobody wants.

The nearby variant, **Nixpacks with a Publish Directory**, does build: it runs Nixpacks, copies
the publish directory out of the image, then runs the same static step [S1; S2, `nixpacks.ts`].
But in a GitHub source Nixpacks builds from the Application's *Build Path* [S2, `directory.ts`],
so pointed at `apps/docs` it doesn't see the root `pnpm-lock.yaml` or the workspace, and pointed
at the root it has to be talked into building one package with environment overrides. Dokploy
also calls Railpack "the successor of Nixpacks" [S1]. That is more configuration in Dokploy's
panel, none of it in the repo, than a ten-line Dockerfile.

### 2. Own nginx (or Caddy) image as a Dockerfile Application: recommended

- **Build.** The Dockerfile build type takes a Dockerfile path, a Docker context path and an
  optional build stage [S1]. Dokploy runs `docker build -f <dockerfile> <context>` [S2,
  `docker-file.ts`], so `apps/docs/Dockerfile` with context `.` gets the whole workspace: the
  root lockfile and, if the docs import Ricambi's tokens, `apps/web/src/styles/tokens.css`
  (ADR 0020). Astro's own Docker recipe is this shape: build, then
  `COPY --from=build /app/dist /usr/share/nginx/html` [S7]. nginx rather than Caddy because TLS is
  Traefik's job here (ADR 0009 as amended), so nothing Caddy adds is used. Either would work.
- **Host.** Domains tab: host `<DOCS_HOST>`, container port 80, HTTPS on, certificate
  `letsencrypt` [S5]. DNS for `<DOCS_HOST>` points at the server, as for `<APP_HOST>` [S5].
- **Rebuild on merge.** See "Why CI, not Dokploy's autodeploy" below.
- **Isolation.** It has its own container and hostname. It sets no cookies, and Ricambi's session
  cookie carries no `Domain` attribute (ADR 0009, pinned in `tests/signing-in.test.ts`), so the
  browser never sends it to `<DOCS_HOST>`. That is the ADR 0009 rule: two hosts, not two paths.
  **Never serve the docs under a path of `<APP_HOST>`.**

### 3. Separate Compose service: works, but adds a file for nothing

A `docker/docs/compose.yml` with one `docs` service building the same Dockerfile would deploy the
same way through `compose.deploy`. Dokploy's Compose Domains tab injects Traefik labels and the
`dokploy-network` at deploy time [S6], so it gets a host just as easily. Compose earns its keep
when there is more than one container or a volume. The docs have neither. The one form that
**would** touch the Ricambi stack is adding the docs as a service in
`docker/preview/compose.yml`. Every docs edit would then redeploy Integration, and Integration
would carry the docs' failures. Don't do that.

## Why CI, not Dokploy's autodeploy

Dokploy offers autodeploy for both Applications and Compose, either through its GitHub integration
or a webhook URL added to the repository, with watch paths to filter by changed files [S3, S8].
Both depend on GitHub reaching the panel. `preview-deployment.md` and `ci.yml` record that the
preview's panel is reachable only over Tailscale, which is why the deploy job joins the tailnet
first. A push webhook from GitHub can't get through. It also says to leave Dokploy's autodeploy
off so that nothing goes out before CI.

So the docs copy the preview's job: a workflow (for example `.github/workflows/docs.yml`) on
`push` to `main` with `paths: ['apps/docs/**']`. It joins the tailnet with the same
`tailscale/github-action` step, then sends a `POST` to `/api/application.deploy` with
`x-api-key` and `{"applicationId": …}` [S3]. It reuses the `DOKPLOY_URL`, `DOKPLOY_API_KEY`,
`TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET` secrets and adds one, `DOKPLOY_DOCS_APPLICATION_ID`.
It can run `pnpm --filter <docs package> build` first, so a broken site never reaches Dokploy.

A separate workflow is needed anyway, because `ci.yml` ignores `**/*.md` and `docs/**` on push.
A change to a Markdown page under `apps/docs/` would never start the preview's job.

On the Club's own server, if the docs go there instead of the preview box: the panel is public
there (ADR 0009, "the Club's own server"), so webhooks would reach it. But CI's token is scoped to
"deploy Integration and nothing else", so it would need widening to the docs Application, or a
second token. The workflow stays the same either way.

## Watch out for

1. **Adding `apps/docs` to the workspace changes the app's image build.** `pnpm-workspace.yaml`
   takes in `apps/*`. The root `Dockerfile` installs with `--frozen-lockfile` after copying only
   the `api`, `web` and `contracts` `package.json` files, then runs `COPY apps ./apps`. The new
   importer in `pnpm-lock.yaml` and the `apps/docs` sources both reach that build. Check in the
   build ticket that the Ricambi image still installs cleanly (and add `COPY
   apps/docs/package.json` or an `apps/docs` line in `.dockerignore` if it doesn't). Root
   `.dockerignore`'s `docs` entry matches only the top-level `docs/`, because patterns are matched
   from the context root [S9]. It doesn't exclude `apps/docs`.
2. **Indexing.** Ricambi sends `noindex` everywhere (`non-production-environment.md`). A
   prototype the Board hasn't said yes to should probably do the same, with an
   `X-Robots-Tag: noindex` line in the nginx config. That is a decision for #254, not a hosting
   one.
3. **No secrets and no hostname in the repo.** `<DOCS_HOST>` is set only in Dokploy's Domains tab.
   The application id is a repository secret, like `DOKPLOY_COMPOSE_ID`.

## Sources

- **S1**: Dokploy docs, *Build Type*: https://docs.dokploy.com/docs/core/applications/build-type
- **S2**: Dokploy source, v0.31.0, `packages/server/src/utils/builders/static.ts`, `nixpacks.ts`,
  `docker-file.ts` and `packages/server/src/utils/filesystem/directory.ts`:
  https://github.com/Dokploy/dokploy/tree/canary/packages/server/src/utils
- **S3**: Dokploy docs, *Auto Deploy* (webhooks, GitHub, `application.deploy` via API):
  https://docs.dokploy.com/docs/core/auto-deploy
- **S4**: Dokploy docs, *Applications*: https://docs.dokploy.com/docs/core/applications
- **S5**: Dokploy docs, *Domains*: https://docs.dokploy.com/docs/core/domains
- **S6**: Dokploy docs, *Docker Compose → Domains*:
  https://docs.dokploy.com/docs/core/docker-compose/domains
- **S7**: Astro docs, *Build your Astro site with Docker*: https://docs.astro.build/en/recipes/docker/
- **S8**: Dokploy docs, *Watch Paths*: https://docs.dokploy.com/docs/core/watch-paths
- **S9**: Docker docs, *.dockerignore files*: https://docs.docker.com/build/concepts/context/#dockerignore-files
- In this repository: `docs/adr/0009-deployment.md`, `docs/operations/preview-deployment.md`,
  `docs/operations/non-production-environment.md`, `docker/preview/compose.yml`, `Dockerfile`,
  `.dockerignore`, `.github/workflows/ci.yml`, `pnpm-workspace.yaml`.
