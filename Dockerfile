# One deployable (ADR 0008): the API serves the built single-page app.
# Deploying this later is configuration, not rework — nothing environment-specific is baked in.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ---- Dependencies -----------------------------------------------------------
FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---- Build ------------------------------------------------------------------
FROM dependencies AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm --filter @ricambi/web build \
  && pnpm --filter @ricambi/api build

# Only what the server needs at runtime.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm --filter @ricambi/api deploy --prod --legacy /runtime

# ---- The commit -------------------------------------------------------------
# The image is told which commit it was built from; it does not find out (ADR 0016). Either as
# the build argument `COMMIT`, or from a checkout's `.git` handed in as a second build context
# named `git` (`docker/preview/compose.yml`). `.git` never enters the main context.
#
# This stage is that name's default, and has no `HEAD` in it: a context named `git` replaces it
# outright, and every build that hands in neither — CI's, anybody's by hand — writes an empty
# file and gets an image that shows the Version alone.
FROM base AS git

FROM base AS commit
ARG COMMIT=
# A clone one commit deep names its branch in `HEAD` and keeps that branch's commit loose or in
# `packed-refs`; a detached checkout writes the commit into `HEAD` itself. Whatever this reads is
# checked again by the server, which shows no commit rather than something that is not one.
RUN --mount=type=bind,from=git,target=/git \
  commit="$COMMIT"; \
  if [ -z "$commit" ] && [ -f /git/HEAD ]; then \
    head="$(cat /git/HEAD)"; \
    case "$head" in \
      "ref: "*) \
        ref="${head#ref: }"; \
        if [ -f "/git/$ref" ]; then commit="$(cat "/git/$ref")"; \
        elif [ -f /git/packed-refs ]; then commit="$(grep " $ref\$" /git/packed-refs | cut -d ' ' -f 1)"; \
        fi ;; \
      *) commit="$head" ;; \
    esac; \
  fi; \
  printf '%s\n' "$commit" > /commit

# ---- Runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

# Fonts, because the image has to be able to run what it contains. A practice system draws its
# own tavole in SVG, and on a slim base librsvg has no fontconfig and no typeface to render
# `<text>` with — so it silently draws everything *except* the words. That produced a
# demonstration archive of numbered circles with no numbers in them, which is the one thing a
# parts catalog may not be. Around 4 MB, and it fails visibly rather than silently if removed.
#
# Poppler's `pdftoppm` and Claude Code, because the server reads the factory catalog itself
# (ADR 0018, issue #55): `pdftoppm` turns the uploaded PDF into pages, and Claude Code is the
# subscription Reading method, signed in through `CLAUDE_CODE_OAUTH_TOKEN`. Pinned, so an image
# built twice reads with the same Claude Code, and kept from updating itself inside a container.
# The last line fails the build if either is missing.
ARG CLAUDE_CODE_VERSION=2.1.302
ENV DISABLE_AUTOUPDATER=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core poppler-utils \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
  && npm cache clean --force \
  && pdftoppm -v \
  && claude --version

# The repository's layout, kept: the server lives in `apps/api` and finds the root `package.json`,
# the one place the Version is written, where it would in a checkout. The commit sits beside it.
WORKDIR /app/apps/api
COPY --from=build --chown=node:node /app/package.json /app/package.json
COPY --from=commit --chown=node:node /commit /app/commit

COPY --from=build --chown=node:node /runtime/node_modules ./node_modules
COPY --from=build --chown=node:node /runtime/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./dist
# The generated SQL travels with the image so a deployment can migrate itself.
COPY --from=build --chown=node:node /app/apps/api/drizzle ./drizzle
# Beside `apps`, not inside the server's directory: `WEB_DIST_PATH` below names it in full.
COPY --from=build --chown=node:node /app/apps/web/dist /app/web

# The app is served from the same origin as the API, so it ships inside this image.
ENV WEB_DIST_PATH=/app/web
ENV PORT=3000
EXPOSE 3000

# The archive's scans. A directory nothing serves — the images are reachable only through the
# authenticated route (ADR 0006) — and one that must be a mounted volume in any deployment,
# since a container that keeps the Club's drawings inside itself loses them on the next deploy.
ENV FILE_STORAGE_PATH=/app/data
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]

USER node
CMD ["node", "dist/main.js"]
