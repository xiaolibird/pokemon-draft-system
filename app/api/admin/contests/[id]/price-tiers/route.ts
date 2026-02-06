import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db/prisma'
import { verifyToken } from '@/app/lib/auth/jwt'
import { cookies } from 'next/headers'

export async function POST(request: Request, context: any) {
  const { id } = await context.params

  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('admin_token')?.value

    if (!token) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload || payload.role !== 'admin') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 1. Verify Admin Exists
    const adminExists = await prisma.admin.findUnique({
      where: { id: payload.id as string },
    })
    if (!adminExists) {
      console.error(`[DEBUG] Admin ${payload.id} not found in database.`)
      return NextResponse.json({ error: '管理员身份失效' }, { status: 401 })
    }

    const body = await request.json()
    console.log(
      `[DEBUG] Received price-tiers update for contest ${id}:`,
      JSON.stringify(body).slice(0, 500) + '...',
    )
    const { tiers, playerTokens, dpTargetMode } = body

    if (!Array.isArray(tiers)) {
      return NextResponse.json({ error: '无效的分档数据' }, { status: 400 })
    }

    const validDpMode = dpTargetMode === 'MINIMUM' ? 'MINIMUM' : 'BEST'

    // 底价绝不为 0：未分档使用比赛统一底价，分档价格至少为 1
    const contestRow = await prisma.contest.findUnique({
      where: { id },
      select: { auctionBasePrice: true },
    })
    const fallbackBasePrice = Math.max(
      1,
      Number(contestRow?.auctionBasePrice) || 10,
    )

    console.log(`[DEBUG] Starting atomic update for contest ${id}...`)

    // 2. Prepare Transaction（priceTiers 存 { tiers, dpTargetMode }，兼容旧格式为纯数组）
    const finalPlayerTokens =
      playerTokens !== undefined && playerTokens !== null
        ? Number(playerTokens)
        : 100
    const priceTiersPayload = { tiers, dpTargetMode: validDpMode }

    const mainUpdates = [
      // A. Update Contest Config
      prisma.contest.update({
        where: { id },
        data: {
          priceTiers: priceTiersPayload as any,
          playerTokens: finalPlayerTokens,
        } as any,
      }),

      // B. Sync Player Tokens
      prisma.player.updateMany({
        where: { contestId: id },
        data: { tokens: finalPlayerTokens },
      }),
    ]

    // C. Prepare Price Updates for Tiers（每档价格至少 1 G）
    const assignedPokemonIds: string[] = []
    for (const tier of tiers) {
      if (tier.pokemonIds && tier.pokemonIds.length > 0) {
        assignedPokemonIds.push(...tier.pokemonIds)
        const safePrice = Math.max(1, Number(tier.price) || 0)
        console.log(
          `[DEBUG] Tier "${tier.name}": Queuing price update for ${tier.pokemonIds.length} pokemon to ${safePrice}G`,
        )
        mainUpdates.push(
          prisma.pokemonPool.updateMany({
            where: {
              contestId: id,
              pokemonId: { in: tier.pokemonIds },
            },
            data: { basePrice: safePrice },
          }),
        )
      }
    }

    // D. Reset Prices for Unassigned（未分档也绝不为 0，使用比赛统一底价）
    mainUpdates.push(
      prisma.pokemonPool.updateMany({
        where: {
          contestId: id,
          pokemonId: { notIn: assignedPokemonIds },
        },
        data: { basePrice: fallbackBasePrice },
      }),
    )

    console.log(
      `[DEBUG] Executing ${mainUpdates.length} operations in atomic transaction...`,
    )
    await prisma.$transaction(mainUpdates)

    console.log(
      `[DEBUG] Atomic update for contest ${id} completed successfully!`,
    )
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('!!! PRICE TIERS UPDATE ERROR !!!')
    console.error('Message:', error.message)
    console.error('Stack:', error.stack)
    return NextResponse.json(
      { error: '服务器错误', details: error.message },
      { status: 500 },
    )
  }
}
