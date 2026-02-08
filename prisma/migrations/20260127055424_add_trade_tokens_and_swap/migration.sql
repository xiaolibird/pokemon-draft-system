-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ruleSet" TEXT NOT NULL,
    "playerTokens" INTEGER NOT NULL DEFAULT 100,
    "maxPokemonPerPlayer" INTEGER NOT NULL DEFAULT 6,
    "draftMode" TEXT NOT NULL,
    "auctionBasePrice" INTEGER NOT NULL DEFAULT 10,
    "priceTiers" JSONB,
    "currentTurn" INTEGER NOT NULL DEFAULT 0,
    "draftOrder" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "auctionPhase" TEXT,
    "activePokemonId" TEXT,
    "auctionBidDuration" INTEGER NOT NULL DEFAULT 30,
    "highestBid" INTEGER,
    "highestBidderId" TEXT,
    "bidEndTime" TIMESTAMP(3),
    "showPlayerPokemon" BOOLEAN NOT NULL DEFAULT true,
    "playerDisplayStyle" TEXT NOT NULL DEFAULT 'minimal',
    "allowTradingDuringDraft" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminId" TEXT NOT NULL,

    CONSTRAINT "Contest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "accessKey" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "pickOrder" INTEGER,
    "isReady" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pokemon" (
    "id" TEXT NOT NULL,
    "num" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nameCn" TEXT,
    "types" TEXT[],
    "hp" INTEGER NOT NULL,
    "atk" INTEGER NOT NULL,
    "def" INTEGER NOT NULL,
    "spa" INTEGER NOT NULL,
    "spd" INTEGER NOT NULL,
    "spe" INTEGER NOT NULL,
    "bst" INTEGER NOT NULL DEFAULT 0,
    "gen" INTEGER NOT NULL DEFAULT 1,
    "abilities" TEXT[],
    "heightm" DOUBLE PRECISION NOT NULL,
    "weightkg" DOUBLE PRECISION NOT NULL,
    "color" TEXT NOT NULL,
    "eggGroups" TEXT[],
    "isForme" BOOLEAN NOT NULL DEFAULT false,
    "baseSpecies" TEXT,
    "isNonstandard" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Pokemon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PokemonPool" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "pokemonId" TEXT NOT NULL,
    "basePrice" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,

    CONSTRAINT "PokemonPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnedPokemon" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "pokemonId" TEXT NOT NULL,
    "purchasePrice" INTEGER,

    CONSTRAINT "OwnedPokemon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "fromPlayerId" TEXT NOT NULL,
    "toPlayerId" TEXT NOT NULL,
    "offeredPokemonId" TEXT,
    "requestedPokemonId" TEXT,
    "offeredTokens" INTEGER NOT NULL DEFAULT 0,
    "requestedTokens" INTEGER NOT NULL DEFAULT 0,
    "swapPickOrder" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftAction" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "playerId" TEXT,
    "actionType" TEXT NOT NULL,
    "pokemonId" TEXT,
    "details" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Player_accessKey_key" ON "Player"("accessKey");

-- AddForeignKey
ALTER TABLE "Contest" ADD CONSTRAINT "Contest_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PokemonPool" ADD CONSTRAINT "PokemonPool_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PokemonPool" ADD CONSTRAINT "PokemonPool_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnedPokemon" ADD CONSTRAINT "OwnedPokemon_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnedPokemon" ADD CONSTRAINT "OwnedPokemon_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_fromPlayerId_fkey" FOREIGN KEY ("fromPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_toPlayerId_fkey" FOREIGN KEY ("toPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftAction" ADD CONSTRAINT "DraftAction_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftAction" ADD CONSTRAINT "DraftAction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
