-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resourceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "details" JSONB,
    "status" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Contest" ADD COLUMN IF NOT EXISTS "isPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contest" ADD COLUMN IF NOT EXISTS "pausedTimeRemaining" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
CREATE INDEX IF NOT EXISTS "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");

-- CreateIndex (Re-adding indexes likely missed due to deleted bad migration)
CREATE INDEX IF NOT EXISTS "Pokemon_bst_idx" ON "Pokemon"("bst");
CREATE INDEX IF NOT EXISTS "Pokemon_gen_idx" ON "Pokemon"("gen");
CREATE INDEX IF NOT EXISTS "Pokemon_tier_idx" ON "Pokemon"("tier");
CREATE INDEX IF NOT EXISTS "Pokemon_tags_idx" ON "Pokemon"("tags");
CREATE INDEX IF NOT EXISTS "PokemonPool_contestId_status_idx" ON "PokemonPool"("contestId", "status");
CREATE INDEX IF NOT EXISTS "PokemonPool_contestId_pokemonId_idx" ON "PokemonPool"("contestId", "pokemonId");
CREATE INDEX IF NOT EXISTS "OwnedPokemon_playerId_idx" ON "OwnedPokemon"("playerId");
CREATE INDEX IF NOT EXISTS "OwnedPokemon_pokemonId_idx" ON "OwnedPokemon"("pokemonId");
CREATE UNIQUE INDEX IF NOT EXISTS "OwnedPokemon_playerId_pokemonId_key" ON "OwnedPokemon"("playerId", "pokemonId");
