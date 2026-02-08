import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";
import {
  checkRateLimit,
  rateLimitConfigs,
} from "@/app/lib/middleware/rate-limit";
import { executeAuctionFinalize } from "@/app/lib/business/auction";
import { broadcastContestUpdate } from "@/app/api/contests/[id]/stream/route";
import { apiError } from "@/app/lib/errors";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("player_token")?.value;

    if (!token) return apiError("未授权", "UNAUTHORIZED", { status: 401 });

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "player")
      return apiError("无权操作", "FORBIDDEN", { status: 403 });

    let body: { contestId?: string };
    try {
      body = await request.json();
    } catch {
      return apiError("请求体无效", "INVALID_REQUEST_BODY", { status: 400 });
    }
    const contestId = body?.contestId;
    if (!contestId || typeof contestId !== "string") {
      return apiError("缺少 contestId", "MISSING_PARAMETER", { status: 400 });
    }

    const rateLimitResult = checkRateLimit(
      request,
      rateLimitConfigs.draftAction,
    );
    if (!rateLimitResult.allowed) {
      return apiError("操作过于频繁，请稍后再试", "RATE_LIMIT_EXCEEDED", {
        reason: "同一IP在短时间内发送了过多请求",
        suggestion: "请等待30秒后重试",
        status: 429,
      });
    }

    // 无时间限制时仅管理员可结束，选手无权调用
    const preCheck = await prisma.contest.findUnique({
      where: { id: contestId },
      select: { bidEndTime: true, auctionPhase: true, status: true },
    });
    if (!preCheck)
      return apiError("比赛未找到", "CONTEST_NOT_FOUND", { status: 404 });
    if (preCheck.status === "COMPLETED") {
      return NextResponse.json({
        success: true,
        alreadyFinalized: true,
        message: "比赛已结束",
      });
    }
    if (preCheck.auctionPhase === "BIDDING" && !preCheck.bidEndTime) {
      return apiError(
        "无时间限制时仅管理员可结束竞拍，请在观战界面操作",
        "ADMIN_ONLY_ACTION",
        {
          reason: "无时间限制的竞拍只能由管理员结束",
          suggestion: "请联系管理员操作",
          status: 403,
        },
      );
    }

    // Note: The following logic is handled inside executeAuctionFinalize (app/lib/auction-finalize.ts)
    // following the "Library Architecture" pattern.
    // Logic included there:
    // 1. SELECT ... FOR UPDATE (to prevent race conditions)
    // 2. Throw 'ALREADY_FINALIZED' if status or phase is invalid
    // 3. check poolItem.status !== 'AVAILABLE'
    const result = await executeAuctionFinalize(prisma, contestId);
    void broadcastContestUpdate(contestId);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Finalize Error:", error);
    const msg = error.message || "服务器错误";

    // 已被其他进程处理，返回成功状态让客户端刷新
    if (msg === "ALREADY_FINALIZED") {
      return NextResponse.json({
        success: true,
        alreadyFinalized: true,
        message: "竞拍已由其他进程完成，请刷新状态",
      });
    }

    if (msg.includes("余额不足")) {
      return apiError(msg, "INSUFFICIENT_TOKENS", {
        reason: "玩家代币不足以完成交易",
        status: 400,
      });
    }
    if (msg.includes("已达宝可梦上限")) {
      return apiError(msg, "TEAM_FULL", {
        reason: "玩家已选择的宝可梦数量已达到上限",
        status: 400,
      });
    }
    if (msg.includes("竞价尚未结束")) {
      return apiError(msg, "BIDDING_NOT_ENDED", {
        reason: "竞价尚未结束",
        suggestion: "请等待竞价时间结束或管理员操作",
        status: 400,
      });
    }

    return apiError(msg, "INTERNAL_SERVER_ERROR", { status: 500 });
  }
}
