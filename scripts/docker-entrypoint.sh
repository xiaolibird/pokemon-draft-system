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
        echo ">>> [AUTO_DB_PUSH=true] Pushing DB schema..."
        npx prisma@6 db push --accept-data-loss
    fi

    # Always ensure client is generated for the current platform
    echo ">>> Ensuring Prisma Client is generated..."
    npx prisma@6 generate
fi

# 3. Command Execution Logic
# If the first argument is a flag, assume we want to run the main app
if [ "${1#-}" != "$1" ]; then
  set -- node server.js "$@"
fi

# Execute the passed command
echo ">>> Executing command: $@"
exec "$@"
