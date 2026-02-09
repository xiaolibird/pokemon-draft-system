import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";
import {
  canFillTeamAfterOperation,
  getAvailablePricesAfterPick,
} from "@/app/lib/business/draft";
import { checkFusionExclusive } from "@/app/lib/utils/constants";
import {
  checkRateLimit,
  rateLimitConfigs,
} from "@/app/lib/middleware/rate-limit";
import { broadcastContestUpdate } from "@/app/lib/sse/server";
import {
  countOwnedInContest,
  countOwnedInContestBatch,
} from "@/app/lib/business/auction";
import { apiError } from "@/app/lib/errors";
import { Contest, PoolItem } from "@/app/types/draft";
import { Prisma } from "@prisma/client";

/**
 * Helper function to find next valid player who can draft
 * Skip players who are bankrupt or full (reached maxPokemon)
 */
async function findNextValidTurnSnake(
  tx: Prisma.TransactionClient,
  contestId: string,
  startTurn: number,
  draftOrder: string[],
  maxPokemon: number,
  pokemonIdsInPool: Set<string>,
  availablePool: PoolItem[],
): Promise<number> {
  const totalTurns = draftOrder.length;

  if (availablePool.length === 0) {
    return totalTurns;
  }

  const minCost = Math.max(
    1,
    Math.min(...availablePool.map((p) => p.basePrice || 0)),
  );
  const uniquePlayerIds = [...new Set(draftOrder)];

  // 批量查询所有玩家的计数和代币信息
  const ownedCounts = await countOwnedInContestBatch(
    tx,
    contestId,
    uniquePlayerIds,
    pokemonIdsInPool,
  );
  const playersInfo = (await tx.player.findMany({
    where: { id: { in: uniquePlayerIds } },
    select: { id: true, tokens: true },
  })) as { id: string; tokens: number }[];
  const playerTokensMap = new Map(playersInfo.map((p) => [p.id, p.tokens]));

  // 第一步：全局检查是否还有任何玩家能继续
  let anyPlayerCanContinue = false;
  for (const playerId of uniquePlayerIds) {
    const tokens = playerTokensMap.get(playerId) ?? 0;
    const ownedInContest = ownedCounts.get(playerId) || 0;
    if (ownedInContest < maxPokemon && tokens >= minCost) {
      anyPlayerCanContinue = true;
      break;
    }
  }
  if (!anyPlayerCanContinue) return totalTurns;

  // 第二步：从 startTurn 开始，找下一个能继续的玩家
  const numPlayers = draftOrder.length;
  for (let attempt = 0; attempt < numPlayers * 2; attempt++) {
    const turn = startTurn + attempt;
    if (turn >= totalTurns) break;

    const playerId = draftOrder[turn];
    const tokens = playerTokensMap.get(playerId) ?? 0;
    const ownedInContest = ownedCounts.get(playerId) || 0;

    if (ownedInContest >= maxPokemon || tokens < minCost) continue;
    return turn;
  }

  return totalTurns;
}

export async function POST(request: Request) {
  const rateLimitResult = checkRateLimit(request, rateLimitConfigs.draftAction);
  if (!rateLimitResult.allowed) {
    return apiError("操作过于频繁，请稍后再试", "RATE_LIMIT_EXCEEDED", {
      reason: "同一IP在短时间内发送了过多请求",
      suggestion: "请等待30秒后重试",
      status: 429,
    });
  }
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("player_token")?.value;

    if (!token) {
      return apiError("未授权", "UNAUTHORIZED", { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "player") {
      return apiError("无权操作", "FORBIDDEN", { status: 403 });
    }

    const body = await request.json();
    const { pokemonPoolId } = body;
    // Strictly use ID from token
    const playerId = payload.id as string;

    if (!pokemonPoolId) {
      return apiError("缺少参数", "MISSING_PARAMETER", { status: 400 });
    }

    // Use interactive transaction to lock state and prevent race conditions
    const result = await prisma.$transaction(async (tx) => {
      // 1. Re-fetch Player with strict lock logic context

      const player = await tx.player.findUnique({
        where: { id: playerId },
        include: {
          contest: true,
          ownedPokemon: true,
        },
      });

      if (!player) throw new Error("选手未找到");
      const contest = player.contest;

      // 2. Check if paused
      if (contest.isPaused || contest.status === "PAUSED") {
        throw new Error("比赛已暂停，请等待管理员继续");
      }

      // 3. Strict Turn Check（取模避免 currentTurn >= draftOrder.length 时越界）
      if (contest.status !== "ACTIVE") throw new Error("比赛未开始或已结束");
      const draftLen = contest.draftOrder?.length ?? 0;
      const currentSlotPlayerId = draftLen
        ? contest.draftOrder[contest.currentTurn % draftLen]
        : undefined;
      if (contest.draftMode === "SNAKE" && currentSlotPlayerId !== playerId) {
        throw new Error("还没轮到你选秀"); // 403
      }

      // 3. CRITICAL FIX: Validate player can still participate (防止死锁)
      // 使用 countOwnedInContest 只统计本比赛的宝可梦数量
      const ownedInContest = await countOwnedInContest(
        tx,
        contest.id,
        playerId,
      );
      if (ownedInContest >= contest.maxPokemonPerPlayer) {
        throw new Error("已达到宝可梦上限");
      }

      // 4. Strict Pool Item Availability Check
      const poolItem = await tx.pokemonPool.findUnique({
        where: { id: pokemonPoolId },
        include: { pokemon: true },
      });

      if (!poolItem || poolItem.status !== "AVAILABLE") {
        throw new Error("该宝可梦不可选或已被抢走");
      }

      // 5. Cost Check（底价绝不为 0：优先池项底价，否则比赛统一底价，最低 1）
      const cost = Math.max(
        1,
        poolItem.basePrice || contest.auctionBasePrice || 1,
      );
      if (player.tokens < cost) {
        throw new Error("代币不足");
      }

      // 5.5. 合体宝可梦互斥检查（Calyrex/Necrozma/Kyurem 系列只能选一个）
      // 6. DP 可行性检查：确保操作后还能选满队伍

      // 优化：一次性查询所有池子数据并缓存
      const allPoolItems = (await tx.pokemonPool.findMany({
        where: { contestId: contest.id },
      })) as unknown as PoolItem[];
      const pokemonIdsInPool = new Set(allPoolItems.map((p) => p.pokemonId));
      const availablePool = allPoolItems.filter(
        (p) => p.status === "AVAILABLE",
      );

      // 合体互斥检查（使用缓存的 pokemonIdsInPool）
      const ownedPokemonIds = player.ownedPokemon
        .filter((op) => pokemonIdsInPool.has(op.pokemonId))
        .map((op) => op.pokemonId);
      const fusionCheck = checkFusionExclusive(
        poolItem.pokemonId,
        ownedPokemonIds,
      );
      if (!fusionCheck.allowed) {
        throw new Error(
          `FUSION_EXCLUSIVE:你已拥有${fusionCheck.groupName}中的宝可梦，不能再选择同系列的其他形态`,
        );
      }

      // DP 可行性检查（使用缓存的 allPoolItems）
      const availablePrices = getAvailablePricesAfterPick(
        allPoolItems.map((p) => ({
          id: p.id,
          basePrice: p.basePrice,
          status: p.status as any,
        })),
        pokemonPoolId,
      );

      const dpCheck = canFillTeamAfterOperation(
        player.tokens,
        ownedInContest,
        contest.maxPokemonPerPlayer,
        cost,
        availablePrices,
      );

      if (!dpCheck.feasible) {
        const err = new Error(
          `DP_VALIDATION_FAILED:${dpCheck.reason}`,
        ) as Error & { dpResult?: typeof dpCheck };
        err.dpResult = dpCheck;
        throw err;
      }

      // 8. Execute Actions
      // Mark pokemon as drafted
      await tx.pokemonPool.update({
        where: { id: pokemonPoolId },
        data: { status: "DRAFTED" },
      });

      // Add to player's collection
      await tx.ownedPokemon.create({
        data: {
          playerId,
          pokemonId: poolItem.pokemonId,
          purchasePrice: cost,
        },
      });

      // Deduct tokens (now safe after validation)
      await tx.player.update({
        where: { id: playerId },
        data: { tokens: { decrement: cost } },
      });

      // Advance active turn with auto-skip logic (防止死锁)
      // 使用之前更新过的池子状态缓存（手动更新当前项状态以避免再次查询）
      const updatedPoolItemsForNextTurn = allPoolItems.map((p) =>
        p.id === pokemonPoolId ? { ...p, status: "PICKED" as const } : p,
      );
      const availablePoolForNextTurn = updatedPoolItemsForNextTurn.filter(
        (p) => p.status === "AVAILABLE",
      ) as PoolItem[];

      const nextTurn = await findNextValidTurnSnake(
        tx,
        contest.id,
        contest.currentTurn + 1,
        contest.draftOrder,
        contest.maxPokemonPerPlayer,
        pokemonIdsInPool,
        availablePoolForNextTurn,
      );

      const isCompleted = nextTurn >= contest.draftOrder.length;
      const curVersion = contest.version ?? 0;

      const updated = await tx.$executeRaw`
                UPDATE "Contest" SET "currentTurn" = ${nextTurn}, "status" = ${isCompleted ? "COMPLETED" : "ACTIVE"}, "version" = "version" + 1
                WHERE "id" = ${contest.id} AND "version" = ${curVersion}
            `;
      if (updated === 0) throw new Error("CONTEST_VERSION_CONFLICT");

      // Record draft action
      await tx.draftAction.create({
        data: {
          contestId: contest.id,
          playerId,
          actionType: "PICK",
          pokemonId: poolItem.pokemonId,
          details: {
            pokemonName: poolItem.pokemon.nameCn || poolItem.pokemon.name,
            cost,
            balance: player.tokens - cost,
          },
        },
      });

      return { success: true, nextTurn, isCompleted, contestId: contest.id };
    });

    void broadcastContestUpdate(result.contestId);
    const { contestId: _cid, ...jsonResult } = result;
    return NextResponse.json(jsonResult);
  } catch (error: unknown) {
    console.error("Draft Pick Error:", error);
    const msg = (error as Error).message || "服务器错误";

    // 版本冲突
    if (msg === "CONTEST_VERSION_CONFLICT") {
      return apiError("状态已更新，请刷新后重试", "VERSION_CONFLICT", {
        reason: "比赛状态已被其他用户更新",
        suggestion: "请刷新页面获取最新状态后重试",
        status: 409,
      });
    }

    // 权限相关错误
    if (msg.includes("还没轮到你")) {
      return apiError(msg, "NOT_YOUR_TURN", {
        reason: "当前不是该玩家的选秀回合",
        status: 403,
      });
    }

    // 业务规则错误（可预知的）
    if (msg.includes("比赛已暂停")) {
      return apiError(msg, "CONTEST_PAUSED", {
        reason: "比赛当前处于暂停状态",
        suggestion: "请等待管理员恢复比赛",
        status: 409,
      });
    }
    if (msg.includes("比赛未开始或已结束")) {
      return apiError(msg, "CONTEST_NOT_ACTIVE", { status: 400 });
    }
    if (msg.includes("已达到宝可梦上限") || msg.includes("代币不足")) {
      const isFull = msg.includes("已达到宝可梦上限");
      return apiError(msg, isFull ? "TEAM_FULL" : "INSUFFICIENT_TOKENS", {
        reason: isFull
          ? "玩家已选择的宝可梦数量已达到上限"
          : "玩家代币不足以继续参与",
        status: 400,
      });
    }
    if (msg.includes("不可选")) {
      return apiError(msg, "POKEMON_NOT_AVAILABLE", {
        reason: "该宝可梦已被选择或不可用",
        suggestion: "请选择其他可用宝可梦",
        status: 409,
      });
    }

    // DP 验证失败
    if (msg.startsWith("DP_VALIDATION_FAILED:")) {
      const dpResult = (error as any).dpResult;
      const reason = msg.replace("DP_VALIDATION_FAILED:", "");
      return apiError(`操作被阻止：${reason}`, "DP_VALIDATION_FAILED", {
        reason,
        suggestion: dpResult?.suggestion,
        status: 400,
      });
    }

    // 合体宝可梦互斥
    if (msg.startsWith("FUSION_EXCLUSIVE:")) {
      const reason = msg.replace("FUSION_EXCLUSIVE:", "");
      return apiError(reason, "FUSION_EXCLUSIVE", { status: 400 });
    }

    // 未预知的错误（真正的服务器错误）
    return apiError("服务器错误", "INTERNAL_SERVER_ERROR", { status: 500 });
  }
}
