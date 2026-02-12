FROM oven/bun:1.2 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN bun install

# Build server bundle
FROM deps AS build
COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/
WORKDIR /app/apps/server
RUN bun build src/index.ts --outdir dist --target bun

# Production image
FROM base AS runtime
ENV NODE_ENV=production

# Copy hoisted node_modules + workspace structure
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

# Copy shared package (raw TS, needed by migrate script)
COPY --from=build /app/packages/shared/ ./packages/shared/

# Copy server: built bundle + migration files + migrate script
COPY --from=build /app/apps/server/dist/ ./apps/server/dist/
COPY --from=build /app/apps/server/src/db/ ./apps/server/src/db/
COPY --from=build /app/apps/server/package.json ./apps/server/

WORKDIR /app/apps/server
EXPOSE 3000
CMD ["sh", "-c", "bun run src/db/migrate.ts && bun run dist/index.js"]
