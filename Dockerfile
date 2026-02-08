# Stage 1: Install dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm ci

# Stage 2: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules

# Add cache buster to force fresh build when source changes
ARG CACHE_BUST=1
# Add build arg for API URL (defaults to http for backward compatibility, override in build command)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Add build version for frontend version detection
ARG BUILD_VERSION=unknown
ARG BUILD_TIME=unknown
ENV NEXT_PUBLIC_BUILD_VERSION=$BUILD_VERSION
ENV BUILD_VERSION=$BUILD_VERSION
ENV BUILD_TIME=$BUILD_TIME

# ============================================
# Layer Optimization: Copy files in order of change frequency
# ============================================

# 0. Copy package.json (needed for npm run build)
COPY package*.json ./

# 1. Copy Prisma schema first (changes infrequently)
COPY prisma ./prisma

# Generate Prisma Client (Pinned Version)
# This layer will be cached unless prisma/schema.prisma changes
RUN npx prisma@6 generate

# 2. Copy Next.js config (changes infrequently)
COPY next.config.ts tsconfig.json postcss.config.mjs ./

# 3. Copy public assets (changes infrequently)
COPY public ./public

# 4. Copy source code (changes frequently)
COPY app ./app
COPY server.js ./

# 5. Copy scripts and other files
COPY scripts ./scripts

# Build Next.js
# This layer will be cached unless source code changes
RUN npm run build

# Stage 2.5: Init tools (for data sync, no build needed)
FROM node:20-alpine AS init
# Install bash for scripts (sync-data.sh requires bash)
RUN apk add --no-cache bash
WORKDIR /app
# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
# Copy package.json for npx commands
COPY package*.json ./
# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma@6 generate
# Copy scripts needed for data sync
COPY scripts ./scripts
# Copy app/lib directory (needed for data sync scripts)
# - app/lib/data/pokemon/rulesets.ts (for extract-rulesets.ts and import-pokemon.ts)
# - app/lib/utils/helpers.ts (for import-pokemon.ts)
COPY app/lib ./app/lib

# Stage 3: Production runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED=1

# Pass build version to runtime
ARG BUILD_VERSION=unknown
ARG BUILD_TIME=unknown
ENV BUILD_VERSION=$BUILD_VERSION
ENV BUILD_TIME=$BUILD_TIME
ENV NEXT_PUBLIC_BUILD_VERSION=$BUILD_VERSION

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy essential files
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json

# Set the correct permission
RUN mkdir .next
RUN chown -R nextjs:nodejs .next ./scripts ./prisma

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/scripts/docker-entrypoint.sh ./scripts/

USER nextjs

EXPOSE 3000

ENV PORT=3000
# set hostname to localhost
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
CMD ["node", "server.js"]
