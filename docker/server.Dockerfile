# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

FROM base AS deps
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/badge-renderer/package.json packages/badge-renderer/package.json
COPY pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS production-deps
COPY package.json pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/badge-renderer/package.json packages/badge-renderer/package.json
COPY pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:22-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-deps --chown=node:node /workspace/node_modules ./node_modules
COPY --from=production-deps --chown=node:node /workspace/apps/server/node_modules ./apps/server/node_modules
COPY --from=production-deps --chown=node:node /workspace/packages ./packages
COPY --from=build --chown=node:node /workspace/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /workspace/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /workspace/packages/badge-renderer/dist ./packages/badge-renderer/dist
COPY --from=build --chown=node:node /workspace/packages/badge-renderer/package.json ./packages/badge-renderer/package.json
COPY --from=build --chown=node:node /workspace/apps/server/dist ./apps/server/dist
COPY --from=build --chown=node:node /workspace/apps/server/package.json ./apps/server/package.json
COPY --from=build --chown=node:node /workspace/apps/dashboard/dist ./apps/server/public/admin
USER node
EXPOSE 3000
WORKDIR /app/apps/server
CMD ["node", "dist/index.js"]
