-- AlterTable: Add contestId column to OwnedPokemon (nullable initially for backfill)
ALTER TABLE "OwnedPokemon" ADD COLUMN "contestId" TEXT;

-- Backfill: Populate contestId from Player.contestId
UPDATE "OwnedPokemon" SET "contestId" = "Player"."contestId"
FROM "Player" WHERE "OwnedPokemon"."playerId" = "Player"."id";

-- Make contestId NOT NULL after backfill
ALTER TABLE "OwnedPokemon" ALTER COLUMN "contestId" SET NOT NULL;

-- Drop old unique constraint
DROP INDEX IF EXISTS "OwnedPokemon_playerId_pokemonId_key";

-- Create new unique constraint (scoped to contest)
CREATE UNIQUE INDEX "OwnedPokemon_playerId_pokemonId_contestId_key" ON "OwnedPokemon"("playerId", "pokemonId", "contestId");

-- Add foreign key to Contest
ALTER TABLE "OwnedPokemon" ADD CONSTRAINT "OwnedPokemon_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
