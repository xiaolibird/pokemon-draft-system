import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { apiError } from "@/app/lib/errors";

export async function GET(_request: Request, context: any) {
  const { id } = await context.params;

  try {
    // 鉴权：admin 或 player 均可查看
    const { verifyToken } = await import("@/app/lib/auth/jwt");
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const adminToken = cookieStore.get("admin_token")?.value;
    const playerToken = cookieStore.get("player_token")?.value;
    if (!adminToken && !playerToken)
      return apiError("未授权", "UNAUTHORIZED", { status: 401 });
    const token = adminToken || playerToken;
    const payload = await verifyToken(token!);
    if (!payload) return apiError("无权操作", "FORBIDDEN", { status: 403 });

    const pool = await prisma.pokemonPool.findMany({
      where: { contestId: id },
      include: { pokemon: true },
      orderBy: { pokemon: { num: "asc" } },
    });

    return NextResponse.json(pool);
  } catch {
    return apiError("服务器错误", "INTERNAL_SERVER_ERROR", { status: 500 });
  }
}

export async function DELETE(request: Request, context: any) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const poolId = searchParams.get("poolId");

  if (!poolId) {
    return apiError("Missing poolId", "MISSING_PARAMETER", { status: 400 });
  }

  try {
    const { verifyToken } = await import("@/app/lib/auth/jwt");
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;

    if (!token)
      return apiError("Unauthorized", "UNAUTHORIZED", { status: 401 });

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return apiError("Unauthorized", "UNAUTHORIZED", { status: 401 });
    }

    const contest = await prisma.contest.findUnique({
      where: { id },
      select: { status: true, priceTiers: true },
    });
    if (!contest)
      return apiError("比赛未找到", "CONTEST_NOT_FOUND", { status: 404 });
    if (contest.status !== "PENDING") {
      return apiError("比赛已开始，不可删除宝可梦", "CONTEST_ALREADY_STARTED", {
        reason: "比赛状态不为 PENDING",
        suggestion: "请在比赛开始前管理宝可梦池",
        status: 403,
      });
    }

    const poolItem = await prisma.pokemonPool.findFirst({
      where: { id: poolId, contestId: id },
      select: { pokemonId: true },
    });
    if (!poolItem)
      return apiError("池中未找到该宝可梦", "POOL_ITEM_NOT_FOUND", {
        status: 404,
      });

    await prisma.pokemonPool.delete({
      where: {
        id: poolId,
        contestId: id,
      },
    });

    // 从 priceTiers 中移除该 pokemonId，使分级页与池子一致
    const rawTiers = contest.priceTiers as any;
    if (
      rawTiers &&
      (Array.isArray(rawTiers)
        ? rawTiers.length > 0
        : rawTiers.tiers?.length > 0)
    ) {
      const tiers = Array.isArray(rawTiers) ? rawTiers : rawTiers.tiers;
      const pokemonId = poolItem.pokemonId;
      const newTiers = tiers.map((t: any) => ({
        ...t,
        pokemonIds: Array.isArray(t.pokemonIds)
          ? t.pokemonIds.filter((pid: string) => pid !== pokemonId)
          : [],
      }));
      const newPriceTiers = Array.isArray(rawTiers)
        ? newTiers
        : { ...rawTiers, tiers: newTiers };
      await prisma.contest.update({
        where: { id },
        data: { priceTiers: newPriceTiers as any },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return apiError("Delete failed", "DELETE_FAILED", { status: 500 });
  }
}

export async function POST(request: Request, context: any) {
  const { id } = await context.params;

  try {
    const { verifyToken } = await import("@/app/lib/auth/jwt");
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;

    if (!token)
      return apiError("Unauthorized", "UNAUTHORIZED", { status: 401 });
    const payload = await verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return apiError("Unauthorized", "UNAUTHORIZED", { status: 401 });
    }

    const body = await request.json();
    const { pokemonId } = body;

    if (!pokemonId) {
      return apiError("Missing pokemonId", "MISSING_PARAMETER", {
        status: 400,
      });
    }

    const contest = await prisma.contest.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!contest)
      return apiError("比赛未找到", "CONTEST_NOT_FOUND", { status: 404 });
    if (contest.status !== "PENDING") {
      return apiError(
        "比赛已开始，不可再添加宝可梦",
        "CONTEST_ALREADY_STARTED",
        {
          reason: "比赛状态不为 PENDING",
          suggestion: "请在比赛开始前管理宝可梦池",
          status: 403,
        },
      );
    }

    // Check if already in pool
    const existing = await prisma.pokemonPool.findFirst({
      where: {
        contestId: id,
        pokemonId: pokemonId,
      },
    });

    if (existing) {
      return apiError("Pokemon already in pool", "DUPLICATE_POKEMON", {
        status: 400,
      });
    }

    const newPoolItem = await prisma.pokemonPool.create({
      data: {
        contestId: id,
        pokemonId: pokemonId,
        status: "AVAILABLE",
      },
      include: {
        pokemon: true,
      },
    });

    return NextResponse.json(newPoolItem);
  } catch (error) {
    console.error(error);
    return apiError("Add failed", "ADD_FAILED", { status: 500 });
  }
}
