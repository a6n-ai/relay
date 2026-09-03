# syntax=docker/dockerfile:1
# Context is the Relay repo root. `APP` is the Next package under apps/ (relay).
# runner = standalone web. build target = source + drizzle-kit + tsx for migrate + drain.

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json ./
RUN npm install -g pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")

FROM base AS build
ARG APP=relay
ENV CI=true
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --offline
RUN --mount=type=cache,id=next-cache-${APP},target=/app/apps/${APP}/.next/cache \
    DATABASE_URL="postgres://build:build@127.0.0.1:5432/build" \
    BETTER_AUTH_SECRET="build-placeholder-not-used-at-runtime" \
    BETTER_AUTH_URL="http://localhost:3010" \
    NEXT_PUBLIC_BETTER_AUTH_URL="http://localhost:3010" \
    pnpm --filter "${APP}" build

FROM base AS runner
ARG APP=relay
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV APP=${APP}
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=build --chown=nextjs:nodejs /app/apps/${APP}/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/${APP}/public ./apps/${APP}/public

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["sh", "-c", "node apps/$APP/server.js"]
