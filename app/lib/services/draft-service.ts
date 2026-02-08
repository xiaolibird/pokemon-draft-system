import { prisma } from "@/app/lib/db/prisma";
import {
  checkTierCompleteness,
  checkTierCompletenessMinimal,
  type PriceTier,
  type DPTargetMode,
} from "@/app/lib/business/draft";
import { AppError } from "../errors";

export class DraftError extends AppError {
  constructor(
    message: string,
    code: string,
    reason?: string,
    suggestion?: string,
    status: number = 400,
  ) {
    super(message, code, reason, suggestion, status);
    this.name = "DraftError";
  }
}

export const DraftService = {
  /**
   * Start a Snake Draft or Auction Draft (Initial Phase)
   * Handles validation, DP checks, shuffling, and status updates.
   */
  async startDraft(contestId: string) {
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      include: {
        players: true,
        pokemonPool: true,
      },
    });

    if (!contest) {
      throw new DraftError(
        "比赛未找到",
        "CONTEST_NOT_FOUND",
        undefined,
        undefined,
        404,
      );
    }

    if (contest.players.length < 2) {
      throw new DraftError(
        "至少需要2名选手才能开始选秀",
        "NOT_ENOUGH_PLAYERS",
        "当前选手数量不足",
        "请添加更多选手后再试",
      );
    }

    // ========================================
    // DP Fesibility Check
    // ========================================
    const rawPriceTiers = (contest as any).priceTiers;
    const priceTiers: PriceTier[] | null = Array.isArray(rawPriceTiers)
      ? rawPriceTiers
      : (rawPriceTiers?.tiers ?? null);
    const dpTargetMode: DPTargetMode =
      (rawPriceTiers?.dpTargetMode as DPTargetMode) === "MINIMUM"
        ? "MINIMUM"
        : "BEST";
    const pokemonPool = contest.pokemonPool;

    // 1. Check Pool Size
    const totalPokemonNeeded =
      contest.players.length * contest.maxPokemonPerPlayer;
    const availablePokemon = pokemonPool.filter(
      (p) => p.status === "AVAILABLE",
    );

    if (availablePokemon.length < totalPokemonNeeded) {
      throw new DraftError(
        `宝可梦池不足！需要 ${totalPokemonNeeded} 只（${contest.players.length} 名玩家 × ${contest.maxPokemonPerPlayer} 只），但池中仅有 ${availablePokemon.length} 只`,
        "POOL_INSUFFICIENT",
        `宝可梦池数量不足，需要 ${totalPokemonNeeded} 只，可用 ${availablePokemon.length} 只`,
        "请添加更多宝可梦到比赛池中",
      );
    }

    // 2. Snake Mode Checks
    if (contest.draftMode === "SNAKE") {
      if (!priceTiers || priceTiers.length === 0) {
        throw new DraftError(
          "请先设置价格分档",
          "NO_PRICE_TIERS",
          "蛇形选秀模式需要设置价格分档",
          "请在管理后台设置价格分档后再开始选秀",
        );
      }

      // Check unassigned pokemon
      const assignedIds = new Set(priceTiers.flatMap((t) => t.pokemonIds));
      const unassignedCount = availablePokemon.filter(
        (p) => !assignedIds.has(p.pokemonId),
      ).length;

      if (unassignedCount > 0) {
        throw new DraftError(
          `还有 ${unassignedCount} 只宝可梦未分配价格分档`,
          "UNASSIGNED_POKEMON",
          `${unassignedCount} 只宝可梦没有分配到任何价格分档`,
          "请为所有宝可梦分配价格分档后再开始选秀",
        );
      }

      // DP Algorithm
      const playerCount = contest.players.length;
      const feasibilityResult =
        dpTargetMode === "MINIMUM"
          ? checkTierCompletenessMinimal(
              priceTiers,
              contest.playerTokens,
              contest.maxPokemonPerPlayer,
              playerCount,
            )
          : checkTierCompleteness(
              priceTiers,
              contest.playerTokens,
              contest.maxPokemonPerPlayer,
              playerCount,
            );

      if (!feasibilityResult.feasible) {
        const problematicTiers =
          feasibilityResult.details
            ?.filter((d) => !d.canInclude)
            .map((d) => d.tierName) || [];

        throw new DraftError(
          `价格设置不完备：${feasibilityResult.reason}`,
          "DP_VALIDATION_FAILED",
          feasibilityResult.reason,
          feasibilityResult.suggestions?.[0]?.reason ?? "请检查价格分档设置",
        );
      }
    }

    // 3. Auction Mode Checks
    if (contest.draftMode === "AUCTION") {
      const basePrice = (contest as any).auctionBasePrice || 10;
      const minTotalCost = basePrice * contest.maxPokemonPerPlayer;

      if (contest.playerTokens < minTotalCost) {
        throw new DraftError(
          `代币不足！每位玩家需要 ${contest.maxPokemonPerPlayer} 只宝可梦，起拍价 ${basePrice}，至少需要 ${minTotalCost} 代币，但玩家只有 ${contest.playerTokens} 代币`,
          "AUCTION_TOKENS_INSUFFICIENT",
          `拍卖模式下代币不足以购买足够的宝可梦`,
          "请增加每位玩家的初始代币数量",
        );
      }
    }

    // ========================================
    // Execution: Shuffle & Update
    // ========================================

    // Shuffle players
    const playerIds = contest.players.map((p) => p.id);
    for (let i = playerIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
    }

    // Generate Draft Order
    const rounds = contest.maxPokemonPerPlayer;
    const draftOrder: string[] = [];

    for (let round = 0; round < rounds; round++) {
      if (contest.draftMode === "AUCTION") {
        // Round Robin for Nominations
        draftOrder.push(...playerIds);
      } else {
        // Snake Draft
        if (round % 2 === 0) {
          draftOrder.push(...playerIds);
        } else {
          draftOrder.push(...[...playerIds].reverse());
        }
      }
    }

    // Transaction
    await prisma.$transaction(async (tx) => {
      // Update Contest
      await tx.contest.update({
        where: { id: contest.id },
        data: {
          status: "ACTIVE",
          draftOrder,
          currentTurn: 0,
          auctionPhase: contest.draftMode === "AUCTION" ? "NOMINATING" : null,
          activePokemonId: null,
          highestBid: null,
          highestBidderId: null,
        } as any,
      });

      // Update Player Pick Orders
      for (let i = 0; i < playerIds.length; i++) {
        await tx.player.update({
          where: { id: playerIds[i] },
          data: { pickOrder: i },
        });
      }
    });

    return {
      success: true,
      draftOrder,
      contestName: contest.name,
      playerCount: contest.players.length,
      draftMode: contest.draftMode,
      maxPokemon: contest.maxPokemonPerPlayer,
    };
  },
};
