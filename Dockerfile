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

# ---- Runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

# Fonts, because the image has to be able to run what it contains. A practice system draws its
# own tavole in SVG, and on a slim base librsvg has no fontconfig and no typeface to render
# `<text>` with — so it silently draws everything *except* the words. That produced a
# demonstration archive of numbered circles with no numbers in them, which is the one thing a
# parts catalog may not be. Around 4 MB, and it fails visibly rather than silently if removed.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /runtime/node_modules ./node_modules
COPY --from=build --chown=node:node /runtime/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./dist
# The generated SQL travels with the image so a deployment can migrate itself.
COPY --from=build --chown=node:node /app/apps/api/drizzle ./drizzle
COPY --from=build --chown=node:node /app/apps/web/dist ./web

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
