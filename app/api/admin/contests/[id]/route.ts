import { prisma } from "@/app/lib/db/prisma";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(_request: Request, context: any) {
  const { id } = await context.params;
  try {
    const cookieStore = await cookies();
    const adminToken = cookieStore.get("admin_token")?.value;
    const playerToken = cookieStore.get("player_token")?.value;

    if (!adminToken && !playerToken) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const contest = await prisma.contest.findUnique({
      where: { id },
      include: {
        pokemonPool: {
          select: {
            id: true,
            status: true,
            basePrice: true,
            pokemon: {
              select: {
                id: true,
                name: true,
                nameCn: true,
                num: true,
                types: true,
                bst: true,
                hp: true,
                atk: true,
                def: true,
                spa: true,
                spd: true,
                spe: true,
                tags: true,
                gen: true,
              },
            },
          },
          orderBy: [{ pokemon: { bst: "desc" } }, { pokemon: { id: "asc" } }],
        },
        players: {
          select: {
            id: true,
            username: true,
            tokens: true,
            lastSeenAt: true,
            contestId: true,
            ownedPokemon: {
              select: {
                id: true,
                purchasePrice: true,
                pokemon: {
                  select: {
                    id: true,
                    name: true,
                    nameCn: true,
                    num: true,
                    types: true,
                  },
                },
              },
            },
            _count: { select: { ownedPokemon: true } },
          },
        },
      },
    });

    if (!contest)
      return NextResponse.json({ error: "比赛未找到" }, { status: 404 });

    const c = contest as any;

    // 返回竞拍是否已过期的标志，让客户端决定是否调用 finalize
    // 这样避免了 GET 请求中进行写操作，也避免了与 finalize API 的竞态条件
    let auctionExpired = false;
    if (
      c.draftMode === "AUCTION" &&
      c.auctionPhase === "BIDDING" &&
      c.bidEndTime
    ) {
      auctionExpired = new Date() > new Date(c.bidEndTime);
    }

    return NextResponse.json({
      ...contest,
      auctionExpired, // 客户端据此调用 finalize API
      timestamp: Date.now(),
    });
  } catch {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
