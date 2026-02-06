import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db/prisma'
import { verifyToken } from '@/app/lib/auth/jwt'
import { cookies } from 'next/headers'
import { checkFusionExclusive } from '@/app/lib/utils/constants'
import { broadcastContestUpdate } from '@/app/api/contests/[id]/stream/route'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('player_token')?.value
    if (!token) return NextResponse.json({ error: '未授权' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload || payload.role !== 'player')
      return NextResponse.json({ error: '无权操作' }, { status: 403 })

    const playerId = payload.id as string
    const { tradeId, action } = await request.json()
    if (!tradeId || !action)
      return NextResponse.json({ error: '参数无效' }, { status: 400 })

    return await prisma.$transaction(async (tx) => {
      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        include: {
          fromPlayer: { include: { ownedPokemon: true } },
          toPlayer: { include: { ownedPokemon: true } },
        },
      })

      if (!trade || trade.status !== 'PENDING') {
        return NextResponse.json(
          { error: '交易不存在或已处理' },
          { status: 404 },
        )
      }

      if (trade.toPlayerId !== playerId) {
        return NextResponse.json({ error: '无权处理此交易' }, { status: 403 })
      }

      if (action === 'REJECT') {
        await tx.trade.update({
          where: { id: tradeId },
          data: { status: 'REJECTED' },
        })
        return NextResponse.json({ success: true })
      }

      const receiver = trade.toPlayer
      const sender = trade.fromPlayer
      const contestId = receiver.contestId

      const contest = await tx.contest.findUnique({
        where: { id: contestId },
      })
      if (!contest) throw new Error('比赛不存在')

      // Bug #2 Validation: checkFusionExclusive, maxPokemonPerPlayer, alreadyOwned

      // 1. maxPokemonPerPlayer check
      const maxPokemon = contest.maxPokemonPerPlayer
      if (
        receiver.ownedPokemon.length >= maxPokemon ||
        sender.ownedPokemon.length >= maxPokemon
      ) {
        return NextResponse.json(
          { error: '玩家已达宝可梦上限', type: 'maxPokemonPerPlayer' },
          { status: 400 },
        )
      }

      if (!trade.offeredPokemonId || !trade.requestedPokemonId) {
        return NextResponse.json({ error: '交易数据不完整' }, { status: 400 })
      }

      // 获取具体的宝可梦 ID (Pokemon.id)
      const offeredOwned = await tx.ownedPokemon.findUnique({
        where: { id: trade.offeredPokemonId },
      })
      const requestedOwned = await tx.ownedPokemon.findUnique({
        where: { id: trade.requestedPokemonId },
      })

      if (!offeredOwned || !requestedOwned)
        throw new Error('交易的宝可梦不存在')

      // 2. alreadyOwned check (duplicate check)
      const receiverHasOffered = receiver.ownedPokemon.some(
        (p) => p.pokemonId === offeredOwned.pokemonId,
      )
      const senderHasRequested = sender.ownedPokemon.some(
        (p) => p.pokemonId === requestedOwned.pokemonId,
      )
      if (receiverHasOffered || senderHasRequested) {
        return NextResponse.json(
          { error: '玩家已拥有该宝可梦', type: 'alreadyOwned' },
          { status: 400 },
        )
      }

      // 3. checkFusionExclusive check
      // Receiver: Check if receiving offeredOwned violates fusion rules (excluding what they trade away)
      const receiverOwnedIdsAfter = receiver.ownedPokemon
        .map((p) => p.pokemonId)
        .filter((id) => id !== requestedOwned.pokemonId)
      const receiverFusionCheck = checkFusionExclusive(
        offeredOwned.pokemonId,
        receiverOwnedIdsAfter,
      )
      if (!receiverFusionCheck.allowed) {
        return NextResponse.json(
          {
            error: `接收方合体互斥: ${receiverFusionCheck.groupName}`,
            type: 'checkFusionExclusive',
          },
          { status: 400 },
        )
      }

      // Sender: Check if receiving requestedOwned violates fusion rules (excluding what they trade away)
      const senderOwnedIdsAfter = sender.ownedPokemon
        .map((p) => p.pokemonId)
        .filter((id) => id !== offeredOwned.pokemonId)
      const senderFusionCheck = checkFusionExclusive(
        requestedOwned.pokemonId,
        senderOwnedIdsAfter,
      )
      if (!senderFusionCheck.allowed) {
        return NextResponse.json(
          {
            error: `发送方合体互斥: ${senderFusionCheck.groupName}`,
            type: 'checkFusionExclusive',
          },
          { status: 400 },
        )
      }

      // Execute Trade
      await tx.ownedPokemon.update({
        where: { id: trade.offeredPokemonId },
        data: { playerId: trade.toPlayerId },
      })
      await tx.ownedPokemon.update({
        where: { id: trade.requestedPokemonId },
        data: { playerId: trade.fromPlayerId },
      })

      await tx.trade.update({
        where: { id: tradeId },
        data: { status: 'ACCEPTED' },
      })

      void broadcastContestUpdate(contestId)
      return NextResponse.json({ success: true })
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
