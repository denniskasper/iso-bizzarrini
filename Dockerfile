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
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---- Build ------------------------------------------------------------------
FROM dependencies AS build
COPY tsconfig.base.json ./
COPY apps ./apps
RUN pnpm --filter @ricambi/web build \
  && pnpm --filter @ricambi/api build

# Only what the server needs at runtime.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm --filter @ricambi/api deploy --prod --legacy /runtime

# ---- Runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

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

USER node
CMD ["node", "dist/main.js"]
