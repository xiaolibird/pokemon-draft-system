import {
  checkRateLimit,
  rateLimitConfigs,
} from "@/app/lib/middleware/rate-limit";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AuctionService,
  AuctionError,
} from "@/app/lib/services/auction-service";
import { apiError } from "@/app/lib/errors";
import logger, { logInfo, logError, logWarn } from "@/app/lib/logger";

export async function POST(request: Request) {
  const startTime = Date.now();
  const rateLimitResult = checkRateLimit(request, rateLimitConfigs.draftAction);
  if (!rateLimitResult.allowed) {
    logWarn("Rate limit exceeded", {
      path: "/api/player/bid",
      ip: request.headers.get("x-forwarded-for") ?? "unknown",
    });
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
      logWarn("Unauthorized bid attempt", {
        path: "/api/player/bid",
        reason: "No token",
      });
      return apiError("未授权", "UNAUTHORIZED", { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "player") {
      logWarn("Forbidden bid attempt", {
        path: "/api/player/bid",
        reason: "Invalid role",
      });
      return apiError("无权操作", "FORBIDDEN", { status: 403 });
    }

    let body: { amount?: number };
    try {
      body = await request.json();
    } catch {
      return apiError("请求体无效", "INVALID_REQUEST_BODY", { status: 400 });
    }
    const amount = Number(body?.amount);

    logInfo("Bid request received", {
      playerId: payload.id,
      amount,
      ip: request.headers.get("x-forwarded-for") ?? "unknown",
    });

    const result = await AuctionService.placeBid(payload.id as string, amount);

    logInfo("Bid successful", {
      playerId: payload.id,
      amount,
      duration: Date.now() - startTime,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof AuctionError) {
      logWarn("Bid validation failed", {
        code: error.code,
        message: error.message,
        reason: error.reason,
        status: error.status,
      });
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          reason: error.reason,
          suggestion: error.suggestion,
          timestamp: new Date().toISOString(),
        },
        { status: error.status },
      );
    }
    logError("Bid error", error, { path: "/api/player/bid" });
    return apiError("服务器错误", "INTERNAL_SERVER_ERROR", { status: 500 });
  }
}
