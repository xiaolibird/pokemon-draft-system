import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";
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

    const fromPlayerId = payload.id as string;
    const { toPlayerId, offeredPokemonId, requestedPokemonId } =
      await request.json();
    if (!toPlayerId || !offeredPokemonId || !requestedPokemonId) {
      return apiError("参数无效", "INVALID_PARAMETER", {
        status: 400,
      });
    }

    if (fromPlayerId === toPlayerId)
      return apiError("不能与自己交易", "SELF_TRADE_NOT_ALLOWED", {
        status: 400,
      });

    // Get contestId from player
    const player = await prisma.player.findUnique({
      where: { id: fromPlayerId },
      select: { contestId: true },
    });
    if (!player)
      return apiError("玩家不存在", "PLAYER_NOT_FOUND", {
        status: 404,
      });

    const trade = await prisma.trade.create({
      data: {
        fromPlayerId,
        toPlayerId,
        offeredPokemonId,
        requestedPokemonId,
        status: "PENDING",
      },
    });

    return NextResponse.json({ success: true, tradeId: trade.id });
  } catch (error: any) {
    console.error("Trade Offer Error:", error);
    return apiError(error.message || "服务器错误", "INTERNAL_SERVER_ERROR", {
      status: 500,
    });
  }
}
