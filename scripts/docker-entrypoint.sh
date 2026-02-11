#!/bin/sh
set -e

# =================================================================================
# Docker Entrypoint Script
# Unifies environment handling for Local Dev, VPS Production, and Maintenance Tasks
# =================================================================================

echo ">>> Docker Entrypoint: Initializing..."

# 1. Detect Environment
if [ -z "$NODE_ENV" ]; then
  export NODE_ENV="production"
fi

echo ">>> Environment: $NODE_ENV"

# 2. Database Migration & Generation (Conditional)
# Only run if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
    echo ">>> Database URL Detected. Checking schema status..."

    # Check if we should auto-push schema (e.g. in local dev or specific deploy mode)
    if [ "$AUTO_DB_PUSH" = "true" ]; then
        echo ">>> [AUTO_DB_PUSH=true] 执行智能迁移..."
        if command -v bash >/dev/null 2>&1; then
            bash scripts/core/migrate.sh
        else
            echo ">>> bash 不可用，回退到 db push..."
            npx prisma@6 db push --accept-data-loss
        fi
    fi

    # Always ensure client is generated for the current platform (Skip in production standalone to avoid crashes)
    if [ "$NODE_ENV" != "production" ] || [ "$AUTO_DB_PUSH" = "true" ]; then
        echo ">>> Ensuring Prisma Client is generated..."
        npx prisma@6 generate
    fi
fi

# 3. Command Execution Logic
# If the first argument is a flag, assume we want to run the main app
if [ "${1#-}" != "$1" ]; then
  set -- node server.js "$@"
fi

# Execute the passed command
echo ">>> Executing command: $@"
exec "$@"
