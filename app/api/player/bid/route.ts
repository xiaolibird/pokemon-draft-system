import { broadcastContestUpdate } from '@/app/api/contests/[id]/stream/route'
import {
  countOwnedInContest,
  countOwnedInContestBatch,
} from '@/app/lib/business/auction'
import { checkFusionExclusive } from '@/app/lib/utils/constants'
import {
  calculateOtherPlayersNeed,
  canFillTeamAfterBid,
  getAvailableCountForAuction,
} from '@/app/lib/business/draft'
import { verifyToken } from '@/app/lib/auth/jwt'
import { prisma } from '@/app/lib/db/prisma'
import {
  checkRateLimit,
  rateLimitConfigs,
} from '@/app/lib/middleware/rate-limit'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const rateLimitResult = checkRateLimit(request, rateLimitConfigs.draftAction)
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: '操作过于频繁，请稍后再试' },
      { status: 429 },
    )
  }
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('player_token')?.value

    if (!token) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload || payload.role !== 'player')
      return NextResponse.json({ error: '无权操作' }, { status: 403 })

    let body: { amount?: number }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '请求体无效' }, { status: 400 })
    }
    const amount = Number(body?.amount)
    const playerId = payload.id as string

    console.log(
      `[BID_DEBUG] Player: ${playerId}, Amount: ${amount}, Contest: ${payload.contestId}`,
    )

    if (!amount || isNaN(amount) || amount <= 0) {
      console.log(`[BID_DEBUG] Invalid amount received: ${body.amount}`)
      return NextResponse.json({ error: '无效的出价金额' }, { status: 400 })
    }

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: {
        contest: {
          include: { pokemonPool: true },
        },
        ownedPokemon: true,
      },
    })

    if (!player)
      return NextResponse.json({ error: '球员未找到' }, { status: 404 })
    const contest = player.contest as any

    // Check if paused
    if (contest.isPaused || contest.status === 'PAUSED') {
      return NextResponse.json(
        { error: '比赛已暂停，请等待管理员继续' },
        { status: 400 },
      )
    }

    if (contest.auctionPhase !== 'BIDDING') {
      return NextResponse.json({ error: '当前不在竞价阶段' }, { status: 400 })
    }

    // 检查是否有时间限制（如果 auctionBidDuration <= 0 或 bidEndTime 为空，则无时间限制）
    const hasTimeLimit = contest.auctionBidDuration > 0 && contest.bidEndTime
    if (hasTimeLimit && new Date() > new Date(contest.bidEndTime)) {
      return NextResponse.json({ error: '出价已截止' }, { status: 400 })
    }

    if (amount <= (contest.highestBid || 0)) {
      return NextResponse.json(
        { error: '出价必须高于当前价格' },
        { status: 400 },
      )
    }

    // 不允许同一玩家连续出价
    if (contest.highestBidderId === playerId) {
      return NextResponse.json(
        { error: '你已是当前最高出价者，不能连续加价' },
        { status: 400 },
      )
    }

    if (player.tokens < amount) {
      return NextResponse.json({ error: '代币不足' }, { status: 400 })
    }

    // 检查玩家是否已满（已满的玩家不能出价）
    // 使用 countOwnedInContest 只统计本比赛的宝可梦数量
    const ownedInContest = await countOwnedInContest(
      prisma,
      contest.id,
      playerId,
    )
    if (ownedInContest >= contest.maxPokemonPerPlayer) {
      return NextResponse.json(
        {
          error: '你已选满宝可梦，不能继续出价',
          type: 'PLAYER_FULL',
        },
        { status: 400 },
      )
    }

    // 获取当前竞拍的宝可梦信息
    const activePoolItem = await prisma.pokemonPool.findUnique({
      where: { id: contest.activePokemonId },
      include: { pokemon: true },
    })

    if (!activePoolItem) {
      return NextResponse.json({ error: '竞拍宝可梦不存在' }, { status: 400 })
    }

    // 合体宝可梦互斥检查（Calyrex/Necrozma/Kyurem 系列只能选一个）
    // 只检查本比赛的宝可梦，避免跨比赛误判
    // 优化：使用 player.contest 中已有的 pokemonPool 数据
    const pokemonIdsInPool = new Set(
      contest.pokemonPool.map((p: any) => p.pokemonId as string),
    ) as Set<string>
    const ownedPokemonIds = player.ownedPokemon
      .filter((op) => pokemonIdsInPool.has(op.pokemonId))
      .map((op) => op.pokemonId)
    const fusionCheck = checkFusionExclusive(
      activePoolItem.pokemonId,
      ownedPokemonIds,
    )
    if (!fusionCheck.allowed) {
      return NextResponse.json(
        {
          error: `你已拥有${fusionCheck.groupName}中的宝可梦，不能竞拍同系列的其他形态`,
          type: 'FUSION_EXCLUSIVE',
        },
        { status: 400 },
      )
    }

    // DP 可行性检查：确保出价后还能选满队伍
    const availableCount = getAvailableCountForAuction(
      contest.pokemonPool.map((p: any) => ({ id: p.id, status: p.status })),
      contest.activePokemonId,
    )

    // Bug Fix #5: 获取所有玩家信息，计算其他玩家还需要的宝可梦数量
    // 使用 countOwnedInContestBatch 确保只统计本比赛的宝可梦数量
    const allPlayers = await prisma.player.findMany({
      where: { contestId: contest.id },
      select: { id: true },
    })
    const allPlayerIds = allPlayers.map((p) => p.id)

    // 批量为每个玩家计算本比赛的宝可梦数量
    const ownedCountsMap = await countOwnedInContestBatch(
      prisma,
      contest.id,
      allPlayerIds,
      pokemonIdsInPool,
    )
    const playerOwnedCounts = allPlayerIds.map((pid) => ({
      id: pid,
      ownedCount: ownedCountsMap.get(pid) || 0,
    }))

    const otherPlayersNeed = calculateOtherPlayersNeed(
      playerOwnedCounts,
      playerId,
      contest.maxPokemonPerPlayer,
    )

    const dpCheck = canFillTeamAfterBid(
      player.tokens,
      ownedInContest, // 使用本比赛的宝可梦数量
      contest.maxPokemonPerPlayer,
      amount,
      contest.auctionBasePrice || 10,
      availableCount + 1, // +1 因为当前拍卖的也算可用
      otherPlayersNeed, // Bug Fix #5: 传入其他玩家需求
    )

    if (!dpCheck.feasible) {
      return NextResponse.json(
        {
          error: `出价被阻止：${dpCheck.reason}`,
          type: 'DP_VALIDATION_FAILED',
          reason: dpCheck.reason,
          suggestion: dpCheck.suggestion,
          maxBidAmount: dpCheck.maxBidAmount,
        },
        { status: 400 },
      )
    }

    // Use interactive transaction to ensure Bid Update + History Log are atomic
    // Even though we use optimistic locking via updateMany, we want ensuring history is written if bid succeeds
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date()

      // Anti-Snipe Logic (Option A):
      // If remaining time < 10s, reset to 10s. Otherwise, do not extend.
      const ANTI_SNIPE_THRESHOLD_MS = 10000 // 10 seconds
      const newEndTime = contest.bidEndTime
        ? new Date(contest.bidEndTime)
        : null

      // Calculate effective end time to update
      // By default, keep the existing end time
      let resolveEndTime = newEndTime

      if (hasTimeLimit) {
        if (!newEndTime) {
          // Should ideally not happen if hasTimeLimit is true, but as fallback
          resolveEndTime = new Date(now.getTime() + ANTI_SNIPE_THRESHOLD_MS)
        } else {
          const remaining = newEndTime.getTime() - now.getTime()
          if (remaining < ANTI_SNIPE_THRESHOLD_MS) {
            resolveEndTime = new Date(now.getTime() + ANTI_SNIPE_THRESHOLD_MS)
          }
        }
      }

      // Atomic conditional update (with optimistic lock) via raw SQL
      // We always increment version. We update bidEndTime only if we changed it (or simpler: just overwrite it, overhead is negligible).
      const curVersion = (contest as any).version ?? 0

      // Note: We update bidEndTime always to resolveEndTime.
      // If resolveEndTime == newEndTime (no change), it effectively writes the same value, which is fine.
      const updateResult =
        hasTimeLimit && resolveEndTime
          ? await tx.$executeRaw`
                    UPDATE "Contest" SET "highestBid" = ${amount}, "highestBidderId" = ${playerId}, "bidEndTime" = ${resolveEndTime}, "version" = "version" + 1
                    WHERE "id" = ${contest.id} AND "version" = ${curVersion} AND "status" = 'ACTIVE' AND "auctionPhase" = 'BIDDING' AND "highestBid" < ${amount} AND "bidEndTime" > ${now}
                `
          : await tx.$executeRaw`
                    UPDATE "Contest" SET "highestBid" = ${amount}, "highestBidderId" = ${playerId}, "version" = "version" + 1
                    WHERE "id" = ${contest.id} AND "version" = ${curVersion} AND "status" = 'ACTIVE' AND "auctionPhase" = 'BIDDING' AND "highestBid" < ${amount}
                `
      if (updateResult === 0) throw new Error('RACE_CONDITION')

      // Record bid action
      const poolItem = await tx.pokemonPool.findUnique({
        where: { id: contest.activePokemonId },
        include: { pokemon: true },
      })

      if (poolItem) {
        await tx.draftAction.create({
          data: {
            contestId: contest.id,
            playerId,
            actionType: 'BID',
            pokemonId: poolItem.pokemonId,
            details: {
              pokemonName: poolItem.pokemon.nameCn || poolItem.pokemon.name,
              bidAmount: amount,
              balance: player.tokens,
            }, // Note: Balance isn't deducted yet, just showing current capacity or potential remaining?
            // Actually for bidding we usually show current tokens.
            // Deduction happens at finalize.
          },
        })
      }

      return { success: true }
    })

    void broadcastContestUpdate(contest.id)
    return NextResponse.json(result)
  } catch (error: any) {
    if (error.message === 'RACE_CONDITION') {
      return NextResponse.json(
        { error: '出价失败：价格已被更新或时间已截止', type: 'RACE_CONDITION' },
        { status: 409 },
      )
    }
    console.error('Bid Error:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
