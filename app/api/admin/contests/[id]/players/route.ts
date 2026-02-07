import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";

export async function GET(request: Request, context: any) {
  const { id } = await context.params;

  try {
    const cookieStore = await cookies();
    const adminToken = cookieStore.get("admin_token")?.value;
    const playerToken = cookieStore.get("player_token")?.value;

    let isAdmin = false;
    if (adminToken) {
      const payload = await verifyToken(adminToken);
      if (payload?.role === "admin") isAdmin = true;
    }

    const players = await prisma.player.findMany({
      where: { contestId: id },
      include: {
        _count: {
          select: { ownedPokemon: true },
        },
        ownedPokemon: {
          include: {
            pokemon: true,
          },
          orderBy: {
            id: "asc",
          },
        },
      },
      orderBy: { pickOrder: "asc" },
    });

    // Mask accessKey for non-admins
    const safePlayers = players.map((p) => {
      const { accessKey, ...rest } = p;
      return isAdmin ? p : rest;
    });

    return NextResponse.json(safePlayers);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
