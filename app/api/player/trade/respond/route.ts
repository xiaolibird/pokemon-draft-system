import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";
import { checkFusionExclusive } from "@/app/lib/utils/constants";
import { broadcastContestUpdate } from "@/app/api/contests/[id]/stream/route";
import { apiError } from "@/app/lib/errors";
import {
  checkRateLimit,
  rateLimitConfigs,
} from "@/app/lib/middleware/rate-limit";

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
    if (!token) return apiError("未授权", "UNAUTHORIZED", { status: 401 });

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "player")
      return apiError("无权操作", "FORBIDDEN", { status: 403 });

    const playerId = payload.id as string;
    const { tradeId, action } = await request.json();
    if (!tradeId || !action)
      return apiError("参数无效", "INVALID_PARAMETER", {
        status: 400,
      });

    return await prisma.$transaction(async (tx) => {
      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        include: {
          fromPlayer: { include: { ownedPokemon: true } },
          toPlayer: { include: { ownedPokemon: true } },
        },
      });

      if (!trade || trade.status !== "PENDING") {
        return apiError("交易不存在或已处理", "TRADE_NOT_FOUND_OR_PROCESSED", {
          status: 404,
        });
      }

      if (trade.toPlayerId !== playerId) {
        return apiError("无权处理此交易", "NOT_TRADE_RECEIVER", {
          status: 403,
        });
      }

      if (action === "REJECT") {
        await tx.trade.update({
          where: { id: tradeId },
          data: { status: "REJECTED" },
        });
        return NextResponse.json({ success: true });
      }

      const receiver = trade.toPlayer;
      const sender = trade.fromPlayer;
      const contestId = receiver.contestId;

      const contest = await tx.contest.findUnique({
        where: { id: contestId },
      });
      if (!contest) throw new Error("比赛不存在");

      // Bug #2 Validation: checkFusionExclusive, maxPokemonPerPlayer, alreadyOwned

      // 1. maxPokemonPerPlayer check
      const maxPokemon = contest.maxPokemonPerPlayer;
      if (
        receiver.ownedPokemon.length >= maxPokemon ||
        sender.ownedPokemon.length >= maxPokemon
      ) {
        return apiError("玩家已达宝可梦上限", "TEAM_FULL", {
          reason: "交易双方中有玩家已达到宝可梦上限",
          status: 400,
        });
      }

      if (!trade.offeredPokemonId || !trade.requestedPokemonId) {
        return apiError("交易数据不完整", "INVALID_TRADE_DATA", {
          status: 400,
        });
      }

      // 获取具体的宝可梦 ID (Pokemon.id)
      const offeredOwned = await tx.ownedPokemon.findUnique({
        where: { id: trade.offeredPokemonId },
      });
      const requestedOwned = await tx.ownedPokemon.findUnique({
        where: { id: trade.requestedPokemonId },
      });

      if (!offeredOwned || !requestedOwned)
        throw new Error("交易的宝可梦不存在");

      // 2. alreadyOwned check (duplicate check)
      const receiverHasOffered = receiver.ownedPokemon.some(
        (p) => p.pokemonId === offeredOwned.pokemonId,
      );
      const senderHasRequested = sender.ownedPokemon.some(
        (p) => p.pokemonId === requestedOwned.pokemonId,
      );
      if (receiverHasOffered || senderHasRequested) {
        return apiError("玩家已拥有该宝可梦", "POKEMON_ALREADY_OWNED", {
          reason: "交易会导致玩家拥有重复的宝可梦",
          status: 400,
        });
      }

      // 3. checkFusionExclusive check
      // Receiver: Check if receiving offeredOwned violates fusion rules (excluding what they trade away)
      const receiverOwnedIdsAfter = receiver.ownedPokemon
        .map((p) => p.pokemonId)
        .filter((id) => id !== requestedOwned.pokemonId);
      const receiverFusionCheck = checkFusionExclusive(
        offeredOwned.pokemonId,
        receiverOwnedIdsAfter,
      );
      if (!receiverFusionCheck.allowed) {
        return apiError(
          `接收方合体互斥: ${receiverFusionCheck.groupName}`,
          "FUSION_EXCLUSIVE_VIOLATION",
          {
            reason: `已拥有该融合系列的宝可梦：${receiverFusionCheck.groupName}`,
            suggestion: "请选择其他不在融合限制范围内的宝可梦",
            status: 400,
          },
        );
      }

      // Sender: Check if receiving requestedOwned violates fusion rules (excluding what they trade away)
      const senderOwnedIdsAfter = sender.ownedPokemon
        .map((p) => p.pokemonId)
        .filter((id) => id !== offeredOwned.pokemonId);
      const senderFusionCheck = checkFusionExclusive(
        requestedOwned.pokemonId,
        senderOwnedIdsAfter,
      );
      if (!senderFusionCheck.allowed) {
        return apiError(
          `发送方合体互斥: ${senderFusionCheck.groupName}`,
          "FUSION_EXCLUSIVE_VIOLATION",
          {
            reason: `已拥有该融合系列的宝可梦：${senderFusionCheck.groupName}`,
            suggestion: "请选择其他不在融合限制范围内的宝可梦",
            status: 400,
          },
        );
      }

      // Execute Trade
      await tx.ownedPokemon.update({
        where: { id: trade.offeredPokemonId },
        data: { playerId: trade.toPlayerId },
      });
      await tx.ownedPokemon.update({
        where: { id: trade.requestedPokemonId },
        data: { playerId: trade.fromPlayerId },
      });

      await tx.trade.update({
        where: { id: tradeId },
        data: { status: "ACCEPTED" },
      });

      void broadcastContestUpdate(contestId);
      return NextResponse.json({ success: true });
    });
  } catch (error: any) {
    console.error("Trade Respond Error:", error);
    return apiError(error.message || "服务器错误", "INTERNAL_SERVER_ERROR", {
      status: 500,
    });
  }
}
