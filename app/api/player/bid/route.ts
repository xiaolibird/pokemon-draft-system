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

export async function POST(request: Request) {
  const rateLimitResult = checkRateLimit(request, rateLimitConfigs.draftAction);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "操作过于频繁，请稍后再试" },
      { status: 429 },
    );
  }
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("player_token")?.value;

    if (!token) return NextResponse.json({ error: "未授权" }, { status: 401 });

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "player")
      return NextResponse.json({ error: "无权操作" }, { status: 403 });

    let body: { amount?: number };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "请求体无效" }, { status: 400 });
    }
    const amount = Number(body?.amount);

    const result = await AuctionService.placeBid(payload.id as string, amount);
    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof AuctionError) {
      return NextResponse.json(
        {
          error: error.message,
          type: error.type,
          reason: error.details?.reason,
          suggestion: error.details?.suggestion,
          maxBidAmount: error.details?.maxBidAmount,
        },
        { status: error.status },
      );
    }
    console.error("Bid Error:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
