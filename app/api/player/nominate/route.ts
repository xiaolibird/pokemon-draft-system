import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";
import {
  checkRateLimit,
  rateLimitConfigs,
} from "@/app/lib/middleware/rate-limit";
import {
  findNextValidTurn,
  countOwnedInContest,
} from "@/app/lib/business/auction";
import { broadcastContestUpdate } from "@/app/api/contests/[id]/stream/route";

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

    let body: { pokemonPoolId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "请求体无效" }, { status: 400 });
    }
    const { pokemonPoolId } = body;
    const playerId = payload.id as string;

    if (!pokemonPoolId)
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });

    // Interactive transaction for strict turn enforcement
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch Player & Contest
      const player = await tx.player.findUnique({
        where: { id: playerId },
        include: { contest: true },
      });

      if (!player) throw new Error("球员未找到");
      const contest = player.contest as any;

      // 2. Check if paused
      if (contest.isPaused || contest.status === "PAUSED") {
        throw new Error("比赛已暂停，请等待管理员继续");
      }

      // 3. Validate Phase & Turn
      if (contest.draftMode !== "AUCTION") throw new Error("非竞价模式");
      if (contest.auctionPhase !== "NOMINATING")
        throw new Error("当前不在提名阶段");

      // Use modulo for cycling through players in Auction mode
      const turnIndex = contest.currentTurn % contest.draftOrder.length;
      if (contest.draftOrder[turnIndex] !== playerId) {
        throw new Error("还没轮到你提名");
      }

      // 用剩余可用池的最低起拍价判断能否继续，避免用 contest.auctionBasePrice 导致提前结束
      const availablePool = await tx.pokemonPool.findMany({
        where: { contestId: contest.id, status: "AVAILABLE" },
        select: { basePrice: true },
      });
      // 底价绝不为 0：与 findNextValidTurn 一致，至少为 1，避免 0 代币被误判为可继续
      const minPoolPrice =
        availablePool.length > 0
          ? Math.max(
              1,
              Math.min(
                ...availablePool.map((p: { basePrice: number }) => p.basePrice),
              ),
            )
          : Math.max(1, contest.auctionBasePrice ?? 10);

      // 用本比赛内已选数量判断是否已满，避免跨比赛误判
      const ownedInContest = await countOwnedInContest(
        tx,
        contest.id,
        playerId,
      );

      // 3. CRITICAL FIX: Check if current player can participate, skip if not (防止死锁)
      // If current turn player cannot participate, auto-skip to next valid turn
      if (
        ownedInContest >= contest.maxPokemonPerPlayer ||
        player.tokens < minPoolPrice
      ) {
        const reason =
          ownedInContest >= contest.maxPokemonPerPlayer
            ? "已达宝可梦上限"
            : "代币不足";

        // Find next valid player (use min pool price so we don't wrongly complete)
        const { turn: nextTurn, shouldComplete } = await findNextValidTurn(
          tx,
          contest.id,
          contest.currentTurn + 1,
          contest.draftOrder,
          contest.maxPokemonPerPlayer,
          minPoolPrice,
        );

        // Update contest to skip this player (optimistic lock)
        const curVersion = (contest as any).version ?? 0;
        const skipUpdated = await tx.$executeRaw`
                    UPDATE "Contest" SET "currentTurn" = ${nextTurn}, "status" = ${shouldComplete ? "COMPLETED" : "ACTIVE"}, "auctionPhase" = ${shouldComplete ? null : "NOMINATING"}, "version" = "version" + 1
                    WHERE "id" = ${contest.id} AND "version" = ${curVersion}
                `;
        if (skipUpdated === 0) throw new Error("CONTEST_VERSION_CONFLICT");

        // Log skip action
        await tx.draftAction.create({
          data: {
            contestId: contest.id,
            playerId: player.id,
            actionType: "NOMINATE_SKIP",
            pokemonId: null,
            details: {
              skipped: true,
              reason: reason,
              autoSkipped: true,
              skippedUsername: player.username,
            },
          },
        });

        return {
          success: true,
          skipped: true,
          reason: `你${reason}，已自动跳过`,
          nextTurn,
          isCompleted: shouldComplete,
          contestId: contest.id,
        };
      }

      // 4. Validate Pokemon
      const poolItem = await tx.pokemonPool.findUnique({
        where: { id: pokemonPoolId },
      });

      if (!poolItem || poolItem.status !== "AVAILABLE") {
        throw new Error("该宝可梦不可选");
      }

      // 起拍价用该池项的 basePrice，不是全局 contest.auctionBasePrice
      const startingBid = poolItem.basePrice ?? contest.auctionBasePrice ?? 10;

      // 5. Calculate Bid Time (0 或负数表示无时间限制)
      const bidDuration = contest.auctionBidDuration;
      const hasTimeLimit = bidDuration > 0;
      const bidEndTime = hasTimeLimit
        ? new Date(Date.now() + bidDuration * 1000)
        : null;

      const pokemon = await tx.pokemon.findUnique({
        where: { id: poolItem.pokemonId },
      });

      // 6. Execute Updates (optimistic lock)
      const curVersion = (contest as any).version ?? 0;
      const nomUpdated = await tx.$executeRaw`
                UPDATE "Contest" SET "auctionPhase" = 'BIDDING', "activePokemonId" = ${pokemonPoolId}, "highestBid" = ${startingBid}, "highestBidderId" = ${playerId}, "bidEndTime" = ${bidEndTime}, "version" = "version" + 1
                WHERE "id" = ${contest.id} AND "version" = ${curVersion}
            `;
      if (nomUpdated === 0) throw new Error("CONTEST_VERSION_CONFLICT");

      // Record nominate action
      await tx.draftAction.create({
        data: {
          contestId: contest.id,
          playerId,
          actionType: "NOMINATE",
          pokemonId: poolItem.pokemonId,
          details: {
            pokemonName: pokemon?.nameCn || pokemon?.name || "Unknown",
            basePrice: startingBid,
            balance: player.tokens,
          },
        },
      });

      return { success: true, contestId: contest.id };
    });

    void broadcastContestUpdate(result.contestId);
    const { contestId: _cid, ...jsonResult } = result;
    return NextResponse.json(jsonResult);
  } catch (error: any) {
    console.error("Nominate Error:", error);
    const msg = error.message || "服务器错误";

    // 版本冲突
    if (msg === "CONTEST_VERSION_CONFLICT") {
      return NextResponse.json(
        { error: "状态已更新，请刷新后重试", type: "VERSION_CONFLICT" },
        { status: 409 },
      );
    }

    // 权限相关错误
    if (msg.includes("还没轮到你")) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    // 业务规则错误（可预知的）
    if (msg.includes("比赛已暂停")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg.includes("非竞价模式") || msg.includes("不在提名阶段")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes("已达到宝可梦上限") || msg.includes("代币不足")) {
      return NextResponse.json(
        { error: msg, shouldSkip: true },
        { status: 400 },
      );
    }
    if (msg.includes("不可选")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    // 未预知的错误（真正的服务器错误）
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
