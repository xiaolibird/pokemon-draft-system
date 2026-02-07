import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";
import { auditFromRequest, AuditActions } from "@/app/lib/middleware/audit";
import {
  checkRateLimit,
  rateLimitConfigs,
} from "@/app/lib/middleware/rate-limit";
import { executeAuctionFinalize } from "@/app/lib/business/auction";
import { broadcastContestUpdate } from "@/app/api/contests/[id]/stream/route";

/**
 * Admin control API for pause/resume/undo/skip operations
 * POST /api/admin/contests/[id]/control
 * Body: { action: 'pause' | 'resume' | 'undo' | 'skip' }
 */
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
      return NextResponse.json({ error: "无权操作" }, { status: 403 });
    }

    const { action } = await request.json();

    const rateLimitResult = checkRateLimit(
      request,
      rateLimitConfigs.draftAction,
    );
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "操作过于频繁，请稍后再试" },
        { status: 429 },
      );
    }

    if (!["pause", "resume", "undo", "skip", "finalize"].includes(action)) {
      return NextResponse.json({ error: "无效操作" }, { status: 400 });
    }

    // Bug Fix #3: 扩大历史记录查询范围（从 10 条增加到 100 条）
    const contest = await prisma.contest.findUnique({
      where: { id },
      include: {
        players: {
          include: { ownedPokemon: true },
        },
        draftActions: {
          orderBy: { timestamp: "desc" },
          take: 100, // 增加到 100 条以支持更多撤销操作
        },
      },
    });

    if (!contest) {
      return NextResponse.json({ error: "比赛未找到" }, { status: 404 });
    }

    if (contest.status !== "ACTIVE" && contest.status !== "PAUSED") {
      return NextResponse.json({ error: "比赛未在进行中" }, { status: 400 });
    }

    const c = contest as any;

    // Handle FINALIZE (无时限时管理员手动结束；有时限且已过期时管理员可代为结算)
    if (action === "finalize") {
      if (c.draftMode !== "AUCTION" || c.auctionPhase !== "BIDDING") {
        return NextResponse.json(
          { error: "当前不在竞价阶段" },
          { status: 400 },
        );
      }
      if (c.bidEndTime && new Date() <= new Date(c.bidEndTime)) {
        return NextResponse.json(
          { error: "有时限模式请等待倒计时结束" },
          { status: 400 },
        );
      }
      try {
        const result = await executeAuctionFinalize(prisma, id);
        await auditFromRequest(request, {
          userId: payload.id as string,
          userType: "ADMIN",
          action: AuditActions.FINALIZE_AUCTION,
          resource: "CONTEST",
          resourceId: id,
          status: "SUCCESS",
          details: result,
        });
        await broadcastContestUpdate(id);
        return NextResponse.json({
          success: true,
          action: "finalized",
          ...result,
        });
      } catch (err: any) {
        if (err.message === "ALREADY_FINALIZED") {
          return NextResponse.json({ success: true, alreadyFinalized: true });
        }
        throw err;
      }
    }

    // Handle PAUSE
    if (action === "pause") {
      if (c.isPaused) {
        return NextResponse.json({ error: "比赛已暂停" }, { status: 400 });
      }

      // Calculate remaining time if in bidding phase
      let remainingTime: number | null = null;
      if (c.bidEndTime) {
        const now = Date.now();
        const endTime = new Date(c.bidEndTime).getTime();
        remainingTime = Math.max(0, Math.floor((endTime - now) / 1000));
      }

      const curVersion = (c as any).version ?? 0;
      const pauseUpdated = await prisma.$executeRaw`
                UPDATE "Contest" SET "isPaused" = true, "pausedTimeRemaining" = ${remainingTime}, "status" = 'PAUSED', "version" = "version" + 1 WHERE "id" = ${id} AND "version" = ${curVersion}
            `;
      if (pauseUpdated === 0) {
        return NextResponse.json(
          { error: "状态已变更，请刷新后重试", type: "VERSION_CONFLICT" },
          { status: 409 },
        );
      }

      // Record action
      await prisma.draftAction.create({
        data: {
          contestId: id,
          playerId: null,
          actionType: "ADMIN_PAUSE",
          details: {
            remainingTime,
            actor: "管理员",
            actorUsername: (payload as any)?.username ?? "管理员",
          },
        },
      });

      // 审计：暂停选秀
      await auditFromRequest(request, {
        userId: payload.id as string,
        userType: "ADMIN",
        action: AuditActions.PAUSE_DRAFT,
        resource: "CONTEST",
        resourceId: id,
        status: "SUCCESS",
        details: { remainingTime },
      });

      await broadcastContestUpdate(id);
      return NextResponse.json({
        success: true,
        action: "paused",
        remainingTime,
      });
    }

    // Handle RESUME
    if (action === "resume") {
      if (!c.isPaused) {
        return NextResponse.json({ error: "比赛未暂停" }, { status: 400 });
      }

      // Restore bidEndTime if we had remaining time
      let newBidEndTime: Date | null = null;
      if (c.pausedTimeRemaining && c.pausedTimeRemaining > 0) {
        newBidEndTime = new Date(Date.now() + c.pausedTimeRemaining * 1000);
      }

      const curVersion = (c as any).version ?? 0;
      const resumeUpdated = newBidEndTime
        ? await prisma.$executeRaw`
                    UPDATE "Contest" SET "isPaused" = false, "pausedTimeRemaining" = NULL, "status" = 'ACTIVE', "bidEndTime" = ${newBidEndTime}, "version" = "version" + 1 WHERE "id" = ${id} AND "version" = ${curVersion}
                `
        : await prisma.$executeRaw`
                    UPDATE "Contest" SET "isPaused" = false, "pausedTimeRemaining" = NULL, "status" = 'ACTIVE', "version" = "version" + 1 WHERE "id" = ${id} AND "version" = ${curVersion}
                `;
      if (resumeUpdated === 0) {
        return NextResponse.json(
          { error: "状态已变更，请刷新后重试", type: "VERSION_CONFLICT" },
          { status: 409 },
        );
      }

      // Record action
      await prisma.draftAction.create({
        data: {
          contestId: id,
          playerId: null,
          actionType: "ADMIN_RESUME",
          details: {
            newBidEndTime: newBidEndTime?.toISOString(),
            actor: "管理员",
            actorUsername: (payload as any)?.username ?? "管理员",
          },
        },
      });

      // 审计：恢复选秀
      await auditFromRequest(request, {
        userId: payload.id as string,
        userType: "ADMIN",
        action: AuditActions.RESUME_DRAFT,
        resource: "CONTEST",
        resourceId: id,
        status: "SUCCESS",
        details: { newBidEndTime: newBidEndTime?.toISOString() },
      });

      await broadcastContestUpdate(id);
      return NextResponse.json({
        success: true,
        action: "resumed",
        newBidEndTime,
      });
    }

    // Handle SKIP - 产品需求：被跳过的资格挪到选秀最后，不丢一次选秀
    // 做法：从 draftOrder 中移除当前槽位，追加到末尾；currentTurn 不变（下一人在同一下标）
    if (action === "skip") {
      const isSnake = c.draftMode === "SNAKE";
      const isAuctionNominate =
        c.draftMode === "AUCTION" && c.auctionPhase === "NOMINATING";
      if (!isSnake && !isAuctionNominate) {
        return NextResponse.json(
          { error: "跳过仅支持蛇形选秀或竞拍提名阶段" },
          { status: 400 },
        );
      }

      const draftOrder = c.draftOrder as string[];
      if (!draftOrder || draftOrder.length === 0) {
        return NextResponse.json({ error: "无效的选秀顺序" }, { status: 400 });
      }

      const currentTurn = c.currentTurn;

      if (currentTurn >= draftOrder.length) {
        return NextResponse.json(
          { error: "选秀已结束，无法跳过" },
          { status: 400 },
        );
      }

      const currentPlayerId = draftOrder[currentTurn];

      if (currentTurn === draftOrder.length - 1) {
        return NextResponse.json(
          { error: "已在最后，无法再移至末尾" },
          { status: 400 },
        );
      }

      // 当前槽位移至整条队列末尾，其余依次前移；currentTurn 不变
      const newDraftOrder = [
        ...draftOrder.slice(0, currentTurn),
        ...draftOrder.slice(currentTurn + 1),
        currentPlayerId,
      ];

      const curVersion = (c as any).version ?? 0;
      const skipUpdated = await prisma.$executeRaw`
                UPDATE "Contest" SET "draftOrder" = ${newDraftOrder}::text[], "version" = "version" + 1 WHERE "id" = ${id} AND "version" = ${curVersion}
            `;
      if (skipUpdated === 0) {
        return NextResponse.json(
          { error: "状态已变更，请刷新后重试", type: "VERSION_CONFLICT" },
          { status: 409 },
        );
      }

      const skippedPlayer = contest.players.find(
        (p: any) => p.id === currentPlayerId,
      );
      await prisma.draftAction.create({
        data: {
          contestId: id,
          playerId: currentPlayerId,
          actionType: "ADMIN_SKIP",
          details: {
            actor: "管理员",
            actorUsername: (payload as any)?.username ?? "管理员",
            skippedUsername: skippedPlayer?.username,
            movedToEndOfDraft: true,
          },
        },
      });

      await auditFromRequest(request, {
        userId: payload.id as string,
        userType: "ADMIN",
        action: AuditActions.SKIP_DRAFT,
        resource: "CONTEST",
        resourceId: id,
        status: "SUCCESS",
        details: { skippedPlayerId: currentPlayerId },
      });

      await broadcastContestUpdate(id);
      return NextResponse.json({
        success: true,
        action: "skipped",
        skippedPlayerId: currentPlayerId,
        skippedUsername: skippedPlayer?.username,
        message: `已跳过 ${skippedPlayer?.username || "当前玩家"}，资格已移至选秀最后`,
      });
    }

    // Handle UNDO - Revert to state after last pokemon was acquired, before next nomination
    if (action === "undo") {
      // Bug Fix #3: 只查找 PICK 类型的操作（实际获得宝可梦的操作）
      // BID 类型在竞拍过程中记录出价，PICK 才是最终获得
      const lastAcquireAction = c.draftActions.find(
        (a: any) => a.actionType === "PICK" && a.pokemonId && a.playerId,
      );

      if (!lastAcquireAction) {
        return NextResponse.json(
          { error: "没有可撤销的操作" },
          { status: 400 },
        );
      }

      // Bug Fix #3: 验证宝可梦是否仍被该玩家拥有（防止交易后无法撤销）
      const ownedPokemon = await prisma.ownedPokemon.findFirst({
        where: {
          playerId: lastAcquireAction.playerId,
          pokemonId: lastAcquireAction.pokemonId,
        },
      });

      if (!ownedPokemon) {
        return NextResponse.json(
          {
            error: "无法撤销：该宝可梦已被交易或状态已变更",
          },
          { status: 400 },
        );
      }

      // Perform undo in transaction
      const result = await prisma.$transaction(async (tx) => {
        // 1. Delete the OwnedPokemon record
        await tx.ownedPokemon.deleteMany({
          where: {
            playerId: lastAcquireAction.playerId,
            pokemonId: lastAcquireAction.pokemonId,
          },
        });

        // 2. Restore the pokemon to pool
        await tx.pokemonPool.updateMany({
          where: {
            contestId: id,
            pokemonId: lastAcquireAction.pokemonId,
          },
          data: { status: "AVAILABLE" },
        });

        // 3. Refund tokens (from action details)
        const cost =
          lastAcquireAction.details?.cost ||
          lastAcquireAction.details?.finalPrice ||
          lastAcquireAction.details?.bidAmount ||
          0;

        if (cost > 0) {
          await tx.player.update({
            where: { id: lastAcquireAction.playerId },
            data: { tokens: { increment: cost } },
          });
        }

        // Bug Fix #3: 正确计算撤销后的 turn
        // 找到被撤销玩家在 draftOrder 中的位置
        let newTurn = c.currentTurn;

        if (c.draftMode === "SNAKE") {
          // Snake 模式：找到被撤销操作对应的 turn
          // 由于选完后 turn 会 +1，撤销后应该回到被撤销玩家的轮次
          // 需要找到 draftOrder 中该玩家最近一次出现的位置
          const undonePlayerId = lastAcquireAction.playerId;

          // 向前搜索找到该玩家的轮次
          for (let t = c.currentTurn - 1; t >= 0; t--) {
            if (c.draftOrder[t] === undonePlayerId) {
              newTurn = t;
              break;
            }
          }
        } else if (c.draftMode === "AUCTION") {
          // Auction 模式：回到该玩家的提名轮次
          // 由于 auction 使用 modulo，找最近的匹配
          const undonePlayerId = lastAcquireAction.playerId;
          const numPlayers = c.draftOrder.length;

          // 向前搜索
          for (let t = c.currentTurn - 1; t >= 0; t--) {
            if (c.draftOrder[t % numPlayers] === undonePlayerId) {
              newTurn = t;
              break;
            }
          }
        }

        const curVersion = (c as any).version ?? 0;
        const undoUpdated = await tx.contest.updateMany({
          where: { id, version: curVersion },
          data: {
            currentTurn: newTurn,
            auctionPhase: c.draftMode === "AUCTION" ? "NOMINATING" : null,
            activePokemonId: null,
            highestBid: null,
            highestBidderId: null,
            bidEndTime: null,
            isPaused: true, // Keep paused after undo
            pausedTimeRemaining: null,
            status: "PAUSED",
            version: curVersion + 1,
          },
        } as any);
        if (undoUpdated.count === 0)
          throw new Error("CONTEST_VERSION_CONFLICT");

        // 5. Record undo action
        const undonePlayer = c.players.find(
          (p: any) => p.id === lastAcquireAction.playerId,
        );
        const undonePoke = lastAcquireAction.pokemonId
          ? await tx.pokemon.findUnique({
              where: { id: lastAcquireAction.pokemonId },
            })
          : null;
        await tx.draftAction.create({
          data: {
            contestId: id,
            playerId: null,
            actionType: "ADMIN_UNDO",
            pokemonId: lastAcquireAction.pokemonId,
            details: {
              undoneActionId: lastAcquireAction.id,
              undonePlayerId: lastAcquireAction.playerId,
              undoneUsername: undonePlayer?.username,
              pokemonName: undonePoke?.nameCn || undonePoke?.name,
              refundedTokens: cost,
              previousTurn: c.currentTurn,
              newTurn: newTurn,
              actor: "管理员",
              actorUsername: (payload as any)?.username ?? "管理员",
            },
          },
        });

        return {
          undonePlayerId: lastAcquireAction.playerId,
          undonePokeId: lastAcquireAction.pokemonId,
          refundedTokens: cost,
          newTurn,
        };
      });

      // 审计：撤销操作
      await auditFromRequest(request, {
        userId: payload.id as string,
        userType: "ADMIN",
        action: AuditActions.UNDO_DRAFT,
        resource: "CONTEST",
        resourceId: id,
        status: "SUCCESS",
        details: result,
      });

      await broadcastContestUpdate(id);
      return NextResponse.json({
        success: true,
        action: "undone",
        ...result,
        message: "已撤销上一次选择，比赛已暂停，请继续",
      });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (error: any) {
    console.error("Admin Control Error:", error);
    if (error.message === "CONTEST_VERSION_CONFLICT") {
      return NextResponse.json(
        { error: "状态已变更，请刷新后重试", type: "VERSION_CONFLICT" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: error.message || "服务器错误" },
      { status: 500 },
    );
  }
}
