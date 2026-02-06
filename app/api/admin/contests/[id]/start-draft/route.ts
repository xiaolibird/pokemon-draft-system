import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db/prisma'
import { verifyToken } from '@/app/lib/auth/jwt'
import { cookies } from 'next/headers'
import {
  checkTierCompleteness,
  checkTierCompletenessMinimal,
  type PriceTier,
  type DPTargetMode,
} from '@/app/lib/business/draft'
import { auditFromRequest, AuditActions } from '@/app/lib/middleware/audit'

// Start snake draft
export async function POST(request: Request, context: any) {
  const { id } = await context.params

  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('admin_token')?.value

    if (!token) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload || payload.role !== 'admin') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const adminExists = await prisma.admin.findUnique({
      where: { id: payload.id as string },
    })
    if (!adminExists) {
      return NextResponse.json({ error: '管理员账号已失效' }, { status: 401 })
    }

    const contest = await prisma.contest.findUnique({
      where: { id },
      include: {
        players: true,
        pokemonPool: true,
      },
    })

    if (!contest) {
      return NextResponse.json({ error: '比赛未找到' }, { status: 404 })
    }

    if (contest.players.length < 2) {
      return NextResponse.json({ error: '至少需要2名选手' }, { status: 400 })
    }

    // ========================================
    // DP 可行性检查
    // ========================================
    const rawPriceTiers = (contest as any).priceTiers
    const priceTiers: PriceTier[] | null = Array.isArray(rawPriceTiers)
      ? rawPriceTiers
      : (rawPriceTiers?.tiers ?? null)
    const dpTargetMode: DPTargetMode =
      rawPriceTiers?.dpTargetMode === 'MINIMUM' ? 'MINIMUM' : 'BEST'
    const pokemonPool = contest.pokemonPool

    // 1. 检查宝可梦池是否有足够的宝可梦
    const totalPokemonNeeded =
      contest.players.length * contest.maxPokemonPerPlayer
    const availablePokemon = pokemonPool.filter((p) => p.status === 'AVAILABLE')

    if (availablePokemon.length < totalPokemonNeeded) {
      return NextResponse.json(
        {
          error: `宝可梦池不足！需要 ${totalPokemonNeeded} 只（${contest.players.length} 名玩家 × ${contest.maxPokemonPerPlayer} 只），但池中仅有 ${availablePokemon.length} 只`,
          type: 'POOL_INSUFFICIENT',
        },
        { status: 400 },
      )
    }

    // 2. Snake 模式：检查价格分档设置是否完备
    if (contest.draftMode === 'SNAKE') {
      if (!priceTiers || priceTiers.length === 0) {
        return NextResponse.json(
          {
            error: '请先设置价格分档',
            type: 'NO_PRICE_TIERS',
          },
          { status: 400 },
        )
      }

      // 检查是否有未分配的宝可梦
      const assignedIds = new Set(priceTiers.flatMap((t) => t.pokemonIds))
      const unassignedCount = availablePokemon.filter(
        (p) => !assignedIds.has(p.pokemonId),
      ).length

      if (unassignedCount > 0) {
        return NextResponse.json(
          {
            error: `还有 ${unassignedCount} 只宝可梦未分配价格分档`,
            type: 'UNASSIGNED_POKEMON',
          },
          { status: 400 },
        )
      }

      // DP 检查：最佳=每人对每档都有方案；保底=每人至少一种选满方案
      const playerCount = contest.players.length
      const feasibilityResult =
        dpTargetMode === 'MINIMUM'
          ? checkTierCompletenessMinimal(
              priceTiers,
              contest.playerTokens,
              contest.maxPokemonPerPlayer,
              playerCount,
            )
          : checkTierCompleteness(
              priceTiers,
              contest.playerTokens,
              contest.maxPokemonPerPlayer,
              playerCount,
            )

      if (!feasibilityResult.feasible) {
        const problematicTiers =
          feasibilityResult.details
            ?.filter((d) => !d.canInclude)
            .map((d) => d.tierName) || []

        return NextResponse.json(
          {
            error: `价格设置不完备：${feasibilityResult.reason}`,
            type: 'DP_VALIDATION_FAILED',
            details: {
              reason: feasibilityResult.reason,
              problematicTiers,
              tierDetails: feasibilityResult.details,
              suggestions: feasibilityResult.suggestions,
              dpTargetMode,
            },
          },
          { status: 400 },
        )
      }
    }

    // 3. Auction 模式：检查基本可行性
    if (contest.draftMode === 'AUCTION') {
      const basePrice = (contest as any).auctionBasePrice || 10
      const minTotalCost = basePrice * contest.maxPokemonPerPlayer

      if (contest.playerTokens < minTotalCost) {
        return NextResponse.json(
          {
            error: `代币不足！每位玩家需要 ${contest.maxPokemonPerPlayer} 只宝可梦，起拍价 ${basePrice}，至少需要 ${minTotalCost} 代币，但玩家只有 ${contest.playerTokens} 代币`,
            type: 'AUCTION_TOKENS_INSUFFICIENT',
          },
          { status: 400 },
        )
      }
    }

    console.log(`[DP Check] 通过！比赛 ${id} 可以开始`)

    // Shuffle players for random order
    const playerIds = contest.players.map((p) => p.id)
    for (let i = playerIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]]
    }

    // Create snake draft order (1,2,3,4,4,3,2,1,1,2,3,4...)
    const rounds = contest.maxPokemonPerPlayer
    const draftOrder: string[] = []

    for (let round = 0; round < rounds; round++) {
      if (contest.draftMode === 'AUCTION') {
        // Round Robin for Auction Nominations
        draftOrder.push(...playerIds)
      } else {
        // Snake Draft
        if (round % 2 === 0) {
          draftOrder.push(...playerIds)
        } else {
          draftOrder.push(...[...playerIds].reverse())
        }
      }
    }

    // Update contest
    await prisma.contest.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        draftOrder,
        currentTurn: 0,
        auctionPhase: contest.draftMode === 'AUCTION' ? 'NOMINATING' : null,
        activePokemonId: null,
        highestBid: null,
        highestBidderId: null,
      } as any,
    })

    // Update player pick orders
    for (let i = 0; i < playerIds.length; i++) {
      await prisma.player.update({
        where: { id: playerIds[i] },
        data: { pickOrder: i },
      })
    }

    // 审计：启动选秀
    await auditFromRequest(request, {
      userId: payload.id as string,
      userType: 'ADMIN',
      action: AuditActions.START_DRAFT,
      resource: 'CONTEST',
      resourceId: id,
      status: 'SUCCESS',
      details: {
        contestName: contest.name,
        playerCount: contest.players.length,
        draftMode: contest.draftMode,
        maxPokemon: contest.maxPokemonPerPlayer,
      },
    })

    return NextResponse.json({ success: true, draftOrder })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
