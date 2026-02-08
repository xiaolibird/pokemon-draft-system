import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";
import crypto from "crypto";
import { apiError } from "@/app/lib/errors";

export async function POST(request: Request, context: any) {
  const { id } = await context.params;

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;

    if (!token) {
      return apiError("未授权", "UNAUTHORIZED", { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return apiError("未授权", "UNAUTHORIZED", { status: 401 });
    }

    const body = await request.json();
    const { playerCount } = body;

    if (!playerCount || playerCount < 2) {
      return apiError("至少需要2名选手", "INVALID_PLAYER_COUNT", {
        status: 400,
      });
    }

    const contest = await prisma.contest.findUnique({
      where: { id },
      include: { players: true },
    });

    if (!contest) {
      return apiError("比赛未找到", "CONTEST_NOT_FOUND", { status: 404 });
    }

    if (contest.status !== "PENDING") {
      return apiError(
        "比赛已开始，无法重新生成密钥",
        "CONTEST_ALREADY_STARTED",
        {
          reason: "比赛状态不为 PENDING",
          suggestion: "请在比赛开始前管理选手",
          status: 400,
        },
      );
    }

    // Delete existing players if any (Regeneration logic)
    await prisma.player.deleteMany({
      where: { contestId: id },
    });

    // Generate access keys for players
    const tokens = [];
    for (let i = 0; i < playerCount; i++) {
      const accessKey = crypto.randomBytes(4).toString("hex").toUpperCase();

      const player = await prisma.player.create({
        data: {
          contestId: id,
          username: `选手${i + 1}`, // Default name, can be changed on first login
          accessKey,
          tokens: contest.playerTokens,
        },
      });

      tokens.push({
        id: player.id,
        accessKey: player.accessKey,
        username: player.username,
      });
    }

    return NextResponse.json({ tokens });
  } catch (error) {
    console.error(error);
    return apiError("服务器错误", "INTERNAL_SERVER_ERROR", { status: 500 });
  }
}
