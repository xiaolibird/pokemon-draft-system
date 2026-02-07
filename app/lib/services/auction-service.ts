import { prisma } from "@/app/lib/db/prisma";
import {
  countOwnedInContest,
  countOwnedInContestBatch,
} from "@/app/lib/business/auction";
import { checkFusionExclusive } from "@/app/lib/utils/constants";
import {
  calculateOtherPlayersNeed,
  canFillTeamAfterBid,
  getAvailableCountForAuction,
} from "@/app/lib/business/draft";
import { broadcastContestUpdate } from "@/app/api/contests/[id]/stream/route";

export class AuctionError extends Error {
  constructor(
    message: string,
    public type?: string,
    public details?: any,
    public status: number = 400,
  ) {
    super(message);
    this.name = "AuctionError";
  }
}

export const AuctionService = {
  /**
   * Place a bid on the active Pokemon
   */
  async placeBid(playerId: string, amount: number) {
    if (!amount || isNaN(amount) || amount <= 0) {
      throw new AuctionError("无效的出价金额");
    }

    // Fetch Player & Contest
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: {
        contest: {
          include: { pokemonPool: true },
        },
        ownedPokemon: true,
      },
    });

    if (!player) throw new AuctionError("玩家未找到", "NOT_FOUND", null, 404);
    const contest = player.contest as any;

    if (!contest) throw new AuctionError("比赛未找到", "NOT_FOUND", null, 404);

    // Basic Validation
    if (contest.isPaused || contest.status === "PAUSED") {
      throw new AuctionError(
        "比赛已暂停，请等待管理员继续",
        "CONTEST_PAUSED",
        null,
        409,
      );
    }
    if (contest.auctionPhase !== "BIDDING") {
      throw new AuctionError("当前不在竞价阶段");
    }

    // Time Limit Check
    const hasTimeLimit = contest.auctionBidDuration > 0 && contest.bidEndTime;
    if (hasTimeLimit && new Date() > new Date(contest.bidEndTime)) {
      throw new AuctionError("出价已截止");
    }

    // Bid Logic Check
    if (amount <= (contest.highestBid || 0)) {
      throw new AuctionError("出价必须高于当前价格");
    }
    if (contest.highestBidderId === playerId) {
      throw new AuctionError("你已是当前最高出价者，不能连续加价");
    }
    if (player.tokens < amount) {
      throw new AuctionError("代币不足");
    }

    // Capacity Check
    const ownedInContest = await countOwnedInContest(
      prisma,
      contest.id,
      playerId,
    );
    if (ownedInContest >= contest.maxPokemonPerPlayer) {
      throw new AuctionError("你已选满宝可梦，不能继续出价", "PLAYER_FULL");
    }

    // Active Pokemon Check
    const activePoolItem = await prisma.pokemonPool.findUnique({
      where: { id: contest.activePokemonId },
      include: { pokemon: true },
    });

    if (!activePoolItem) {
      throw new AuctionError("竞拍宝可梦不存在");
    }

    // Fusion Check
    const pokemonIdsInPool = new Set(
      contest.pokemonPool.map((p: any) => p.pokemonId as string),
    ) as Set<string>;
    const ownedPokemonIds = player.ownedPokemon
      .filter((op) => pokemonIdsInPool.has(op.pokemonId))
      .map((op) => op.pokemonId);

    const fusionCheck = checkFusionExclusive(
      activePoolItem.pokemonId,
      ownedPokemonIds,
    );
    if (!fusionCheck.allowed) {
      throw new AuctionError(
        `你已拥有${fusionCheck.groupName}中的宝可梦，不能竞拍同系列的其他形态`,
        "FUSION_EXCLUSIVE",
      );
    }

    // DP Viability Check
    const availableCount = getAvailableCountForAuction(
      contest.pokemonPool.map((p: any) => ({ id: p.id, status: p.status })),
      contest.activePokemonId,
    );

    const allPlayers = await prisma.player.findMany({
      where: { contestId: contest.id },
      select: { id: true },
    });
    const allPlayerIds = allPlayers.map((p) => p.id);

    const ownedCountsMap = await countOwnedInContestBatch(
      prisma,
      contest.id,
      allPlayerIds,
      pokemonIdsInPool,
    );
    const playerOwnedCounts = allPlayerIds.map((pid) => ({
      id: pid,
      ownedCount: ownedCountsMap.get(pid) || 0,
    }));

    const otherPlayersNeed = calculateOtherPlayersNeed(
      playerOwnedCounts,
      playerId,
      contest.maxPokemonPerPlayer,
    );

    const dpCheck = canFillTeamAfterBid(
      player.tokens,
      ownedInContest,
      contest.maxPokemonPerPlayer,
      amount,
      contest.auctionBasePrice || 10,
      availableCount + 1,
      otherPlayersNeed,
    );

    if (!dpCheck.feasible) {
      throw new AuctionError(
        `出价被阻止：${dpCheck.reason}`,
        "DP_VALIDATION_FAILED",
        {
          reason: dpCheck.reason,
          suggestion: dpCheck.suggestion,
          maxBidAmount: dpCheck.maxBidAmount,
        },
      );
    }

    // Execution: Optimistic Lock & History
    try {
      const result = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const ANTI_SNIPE_THRESHOLD_MS = 10000; // 10s
        const newEndTime = contest.bidEndTime
          ? new Date(contest.bidEndTime)
          : null;
        let resolveEndTime = newEndTime;

        if (hasTimeLimit) {
          if (!newEndTime) {
            resolveEndTime = new Date(now.getTime() + ANTI_SNIPE_THRESHOLD_MS);
          } else {
            const remaining = newEndTime.getTime() - now.getTime();
            if (remaining < ANTI_SNIPE_THRESHOLD_MS) {
              resolveEndTime = new Date(
                now.getTime() + ANTI_SNIPE_THRESHOLD_MS,
              );
            }
          }
        }

        const curVersion = (contest as any).version ?? 0;

        const updateResult =
          hasTimeLimit && resolveEndTime
            ? await tx.$executeRaw`
                      UPDATE "Contest" SET "highestBid" = ${amount}, "highestBidderId" = ${playerId}, "bidEndTime" = ${resolveEndTime}, "version" = "version" + 1
                      WHERE "id" = ${contest.id} AND "version" = ${curVersion} AND "status" = 'ACTIVE' AND "auctionPhase" = 'BIDDING' AND "highestBid" < ${amount} AND "bidEndTime" > ${now}
                  `
            : await tx.$executeRaw`
                      UPDATE "Contest" SET "highestBid" = ${amount}, "highestBidderId" = ${playerId}, "version" = "version" + 1
                      WHERE "id" = ${contest.id} AND "version" = ${curVersion} AND "status" = 'ACTIVE' AND "auctionPhase" = 'BIDDING' AND "highestBid" < ${amount}
                  `;

        if (updateResult === 0) throw new Error("RACE_CONDITION");

        // Record Action
        // We re-fetch pool item inside tx to be safe, though activePoolItem is already fetched.
        // Using activePoolItem is fine as it doesn't change during bid (only price/owner change).
        if (activePoolItem) {
          await tx.draftAction.create({
            data: {
              contestId: contest.id,
              playerId,
              actionType: "BID",
              pokemonId: activePoolItem.pokemonId,
              details: {
                pokemonName:
                  activePoolItem.pokemon.nameCn || activePoolItem.pokemon.name,
                bidAmount: amount,
                balance: player.tokens,
              },
            },
          });
        }

        return { success: true };
      });

      // Broadcast update
      void broadcastContestUpdate(contest.id);
      return result;
    } catch (error: any) {
      if (error.message === "RACE_CONDITION") {
        throw new AuctionError(
          "出价失败：价格已被更新或时间已截止",
          "RACE_CONDITION",
          null,
          409,
        );
      }
      throw error; // Re-throw other errors
    }
  },
};
