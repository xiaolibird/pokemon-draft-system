import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { apiError } from "@/app/lib/errors";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { basePrice } = await req.json();
    const { id: contestId } = await params;

    if (typeof basePrice !== "number" || basePrice < 1) {
      return apiError("底价必须为正整数", "INVALID_BASE_PRICE", {
        status: 400,
      });
    }

    // Verify contest exists and is in PENDING status
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
    });

    if (!contest) {
      return apiError("比赛不存在", "CONTEST_NOT_FOUND", { status: 404 });
    }

    if (contest.status !== "PENDING") {
      return apiError("只能在比赛开始前调整底价", "CONTEST_ALREADY_STARTED", {
        reason: "比赛状态不为 PENDING",
        suggestion: "请在比赛开始前调整底价",
        status: 400,
      });
    }

    if (contest.draftMode !== "AUCTION") {
      return apiError("只有竞拍模式支持底价设置", "NOT_AUCTION_MODE", {
        reason: "当前比赛不是 AUCTION 模式",
        status: 400,
      });
    }

    // Update base price
    const updated = await prisma.contest.update({
      where: { id: contestId },
      data: { auctionBasePrice: basePrice },
    });

    return NextResponse.json({
      success: true,
      auctionBasePrice: updated.auctionBasePrice,
    });
  } catch {
    return apiError("更新失败", "UPDATE_FAILED", { status: 500 });
  }
}
