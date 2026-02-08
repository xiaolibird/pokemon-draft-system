-- Add performance indexes for Pokemon table filtering and sorting
-- These indexes significantly improve query performance when filtering by tier, generation, BST, or tags

-- First ensure tier column exists (it seems it was added via db push previously)
ALTER TABLE "Pokemon" ADD COLUMN IF NOT EXISTS "tier" TEXT;

CREATE INDEX "Pokemon_bst_idx" ON "Pokemon"("bst");

CREATE INDEX "Pokemon_gen_idx" ON "Pokemon"("gen");

CREATE INDEX "Pokemon_tier_idx" ON "Pokemon"("tier");

CREATE INDEX "Pokemon_tags_idx" ON "Pokemon"("tags");
