import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";
import crypto from "crypto";

export async function POST(request: Request, context: any) {
  const { id } = await context.params;

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;

    if (!token) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await request.json();
    const { playerCount } = body;

    if (!playerCount || playerCount < 2) {
      return NextResponse.json({ error: "至少需要2名选手" }, { status: 400 });
    }

    const contest = await prisma.contest.findUnique({
      where: { id },
      include: { players: true },
    });

    if (!contest) {
      return NextResponse.json({ error: "比赛未找到" }, { status: 404 });
    }

    if (contest.status !== "PENDING") {
      return NextResponse.json(
        { error: "比赛已开始，无法重新生成密钥" },
        { status: 400 },
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
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
