import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db/prisma'
import { verifyToken } from '@/app/lib/auth/jwt'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('player_token')?.value
    if (!token) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload || payload.role !== 'player')
      return NextResponse.json({ error: '无权操作' }, { status: 403 })

    const fromPlayerId = payload.id as string
    const { toPlayerId, offeredPokemonId, requestedPokemonId } =
      await request.json()
    if (!toPlayerId || !offeredPokemonId || !requestedPokemonId) {
      return NextResponse.json({ error: '参数无效' }, { status: 400 })
    }

    if (fromPlayerId === toPlayerId)
      return NextResponse.json({ error: '不能与自己交易' }, { status: 400 })

    // Get contestId from player
    const player = await prisma.player.findUnique({
      where: { id: fromPlayerId },
      select: { contestId: true },
    })
    if (!player)
      return NextResponse.json({ error: '玩家不存在' }, { status: 404 })

    const trade = await prisma.trade.create({
      data: {
        fromPlayerId,
        toPlayerId,
        offeredPokemonId,
        requestedPokemonId,
        status: 'PENDING',
      },
    })

    return NextResponse.json({ success: true, tradeId: trade.id })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
