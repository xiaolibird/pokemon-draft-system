import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";

export async function GET(request: Request, context: any) {
  const { id } = await context.params;

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("player_token")?.value;

    if (!token) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "player" || payload.id !== id) {
      return NextResponse.json({ error: "无权访问此数据" }, { status: 403 });
    }

    const ownedPokemon = await prisma.ownedPokemon.findMany({
      where: { playerId: id },
      include: { pokemon: true },
    });

    return NextResponse.json(ownedPokemon);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
