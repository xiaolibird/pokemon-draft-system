import { prisma } from "@/app/lib/db/prisma";
import { Contest, PoolItem } from "@/app/types/draft";
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
import { broadcastContestUpdate } from "@/app/lib/sse/server";
import { AppError } from "../errors";
import logger, { logInfo, logError } from "../logger";

export class AuctionError extends AppError {
  constructor(
    message: string,
    code: string,
    reason?: string,
    suggestion?: string,
    status: number = 400,
  ) {
    super(message, code, reason, suggestion, status);
    this.name = "AuctionError";
  }
}

export const AuctionService = {
  /**
   * Place a bid on the active Pokemon
   * 所有校验在事务内执行，使用 FOR UPDATE 防止 TOCTOU 竞态
   */
  async placeBid(playerId: string, amount: number) {
    const startTime = Date.now();
    logInfo("Bid attempt started", { playerId, amount });

    // 参数校验（不需要 DB）
    if (!amount || isNaN(amount) || amount <= 0) {
      throw new AuctionError("无效的出价金额", "INVALID_BID_AMOUNT");
    }

    let contestId: string | undefined;

    try {
      const result = await prisma.$transaction(async (tx) => {
        // ============================================================
        // 1. 在事务内用 FOR UPDATE 锁定 Player 行，防止并发修改代币
        // ============================================================
        const playerRows = (await tx.$queryRaw`
          SELECT p.*, row_to_json(c.*) as contest_json
          FROM "Player" p
          JOIN "Contest" c ON p."contestId" = c."id"
          WHERE p."id" = ${playerId}
          FOR UPDATE OF p
        `) as any[];

        if (!playerRows?.length)
          throw new AuctionError(
            "玩家未找到",
            "PLAYER_NOT_FOUND",
            undefined,
            undefined,
            404,
          );

        const playerRow = playerRows[0];
        const contestRow = playerRow.contest_json;
        contestId = contestRow.id;

        if (!contestRow)
          throw new AuctionError(
            "比赛未找到",
            "CONTEST_NOT_FOUND",
            undefined,
            undefined,
            404,
          );

        // ============================================================
        // 2. 基础状态校验（使用事务内最新数据）
        // ============================================================
        if (contestRow.isPaused || contestRow.status === "PAUSED") {
          throw new AuctionError(
            "比赛已暂停，请等待管理员继续",
            "CONTEST_PAUSED",
            "比赛当前处于暂停状态",
            "请等待管理员恢复比赛后再进行操作",
            409,
          );
        }
        if (contestRow.auctionPhase !== "BIDDING") {
          throw new AuctionError("当前不在竞价阶段", "NOT_IN_BIDDING_PHASE");
        }

        // 时间校验
        const hasTimeLimit =
          (contestRow.auctionBidDuration ?? 0) > 0 && contestRow.bidEndTime;
        if (
          hasTimeLimit &&
          new Date() > new Date(contestRow.bidEndTime as string)
        ) {
          throw new AuctionError("出价已截止", "BID_TIME_EXPIRED");
        }

        // 出价逻辑校验
        if (amount <= (contestRow.highestBid || 0)) {
          throw new AuctionError("出价必须高于当前价格", "BID_TOO_LOW");
        }
        if (contestRow.highestBidderId === playerId) {
          throw new AuctionError(
            "你已是当前最高出价者，不能连续加价",
            "ALREADY_HIGHEST_BIDDER",
          );
        }
        if (playerRow.tokens < amount) {
          throw new AuctionError("代币不足", "INSUFFICIENT_TOKENS");
        }

        // ============================================================
        // 3. 容量检查（事务内）
        // ============================================================
        const ownedInContest = await countOwnedInContest(
          tx,
          contestRow.id,
          playerId,
        );
        if (ownedInContest >= contestRow.maxPokemonPerPlayer) {
          throw new AuctionError(
            "你已选满宝可梦，不能继续出价",
            "PLAYER_TEAM_FULL",
            "玩家已选择的宝可梦数量已达到上限",
            `每名玩家最多可以选择 ${contestRow.maxPokemonPerPlayer} 只宝可梦`,
          );
        }

        // ============================================================
        // 4. 竞拍宝可梦 & 融合检查（事务内）
        // ============================================================
        const activePoolItem = await tx.pokemonPool.findUnique({
          where: { id: contestRow.activePokemonId || "" },
          include: { pokemon: true },
        });
        if (!activePoolItem) {
          throw new AuctionError("竞拍宝可梦不存在", "POKEMON_NOT_FOUND");
        }

        const poolItems = await tx.pokemonPool.findMany({
          where: { contestId: contestRow.id },
          select: { id: true, pokemonId: true, status: true },
        });
        const pokemonIdsInPool = new Set(poolItems.map((p) => p.pokemonId));

        const ownedPokemon = await tx.ownedPokemon.findMany({
          where: { playerId },
          select: { pokemonId: true },
        });
        const ownedPokemonIds = ownedPokemon
          .filter((op) => pokemonIdsInPool.has(op.pokemonId))
          .map((op) => op.pokemonId);

        const fusionCheck = checkFusionExclusive(
          activePoolItem.pokemonId,
          ownedPokemonIds,
        );
        if (!fusionCheck.allowed) {
          throw new AuctionError(
            `你已拥有${fusionCheck.groupName}中的宝可梦，不能竞拍同系列的其他形态`,
            "FUSION_EXCLUSIVE_VIOLATION",
            `已拥有该融合系列的宝可梦：${fusionCheck.groupName}`,
            "请选择其他不在融合限制范围内的宝可梦",
          );
        }

        // ============================================================
        // 5. DP 可行性检查（事务内）
        // ============================================================
        const availableCount = getAvailableCountForAuction(
          poolItems.map((p) => ({ id: p.id, status: p.status as any })),
          contestRow.activePokemonId as string,
        );

        const allPlayers = await tx.player.findMany({
          where: { contestId: contestRow.id },
          select: { id: true },
        });
        const allPlayerIds = allPlayers.map((p) => p.id);

        const ownedCountsMap = await countOwnedInContestBatch(
          tx,
          contestRow.id,
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
          contestRow.maxPokemonPerPlayer,
        );

        const dpCheck = canFillTeamAfterBid(
          playerRow.tokens,
          ownedInContest,
          contestRow.maxPokemonPerPlayer,
          amount,
          contestRow.auctionBasePrice || 10,
          availableCount + 1,
          otherPlayersNeed,
        );

        if (!dpCheck.feasible) {
          throw new AuctionError(
            `出价被阻止：${dpCheck.reason}`,
            "DP_VALIDATION_FAILED",
            dpCheck.reason,
            dpCheck.suggestion,
          );
        }

        // ============================================================
        // 6. 执行：乐观锁 UPDATE + 记录历史
        // ============================================================
        const now = new Date();
        const ANTI_SNIPE_THRESHOLD_MS = 10000; // 10s
        const newEndTime = contestRow.bidEndTime
          ? new Date(contestRow.bidEndTime as string)
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

        const curVersion = contestRow.version ?? 0;

        const updateResult =
          hasTimeLimit && resolveEndTime
            ? await tx.$executeRaw`
                      UPDATE "Contest" SET "highestBid" = ${amount}, "highestBidderId" = ${playerId}, "bidEndTime" = ${resolveEndTime}, "version" = "version" + 1
                      WHERE "id" = ${contestRow.id} AND "version" = ${curVersion} AND "status" = 'ACTIVE' AND "auctionPhase" = 'BIDDING' AND "highestBid" < ${amount} AND "bidEndTime" > ${now}
                  `
            : await tx.$executeRaw`
                      UPDATE "Contest" SET "highestBid" = ${amount}, "highestBidderId" = ${playerId}, "version" = "version" + 1
                      WHERE "id" = ${contestRow.id} AND "version" = ${curVersion} AND "status" = 'ACTIVE' AND "auctionPhase" = 'BIDDING' AND "highestBid" < ${amount}
                  `;

        if (updateResult === 0) throw new Error("RACE_CONDITION");

        // Record Action
        const poolItemTyped = activePoolItem as unknown as PoolItem;
        await tx.draftAction.create({
          data: {
            contestId: contestRow.id,
            playerId,
            actionType: "BID",
            pokemonId: poolItemTyped.pokemonId,
            details: {
              pokemonName:
                poolItemTyped.pokemon.nameCn || poolItemTyped.pokemon.name,
              bidAmount: amount,
              balance: playerRow.tokens,
            },
          },
        });

        return { success: true, contestId: contestRow.id };
      });

      // Broadcast update (outside transaction)
      void broadcastContestUpdate(result.contestId);

      logInfo("Bid successful", {
        playerId,
        amount,
        contestId: result.contestId,
        newPrice: amount,
        duration: Date.now() - startTime,
      });

      return { success: true };
    } catch (error: unknown) {
      if (error instanceof AuctionError) throw error;
      logError("Bid execution failed", error as Error, {
        playerId,
        amount,
        contestId,
      });
      if ((error as Error).message === "RACE_CONDITION") {
        throw new AuctionError(
          "出价失败：价格已被更新或时间已截止",
          "RACE_CONDITION",
          "并发冲突：多个用户同时对同一物品出价",
          "请刷新页面查看最新价格后重新出价",
          409,
        );
      }
      throw error;
    }
  },
};
