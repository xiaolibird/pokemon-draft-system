/**
 * 竞价结算逻辑（抽离供 player 与 admin 共用）
 */

/** 统计该玩家在本比赛中已选数量（只计本比赛池子内的 pokemonId，避免跨比赛误判） */
export async function countOwnedInContest(
  tx: any,
  contestId: string,
  playerId: string,
  poolIdsCache?: Set<string>,
): Promise<number> {
  let pokemonIdsInPool: Set<string>
  if (poolIdsCache) {
    pokemonIdsInPool = poolIdsCache
  } else {
    const poolIds = (await tx.pokemonPool.findMany({
      where: { contestId },
      select: { pokemonId: true },
    })) as { pokemonId: string }[]
    pokemonIdsInPool = new Set(poolIds.map((p) => p.pokemonId))
  }

  const owned = (await tx.ownedPokemon.findMany({
    where: { playerId },
    select: { pokemonId: true },
  })) as { pokemonId: string }[]
  return owned.filter((o) => pokemonIdsInPool.has(o.pokemonId)).length
}

/** 批量统计选手在比赛中已选数量 */
export async function countOwnedInContestBatch(
  tx: any,
  contestId: string,
  playerIds: string[],
  poolIdsCache?: Set<string>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  playerIds.forEach((pid) => counts.set(pid, 0))

  let pokemonIdsInPool: Set<string>
  if (poolIdsCache) {
    pokemonIdsInPool = poolIdsCache
  } else {
    const poolIds = (await tx.pokemonPool.findMany({
      where: { contestId },
      select: { pokemonId: true },
    })) as { pokemonId: string }[]
    pokemonIdsInPool = new Set(poolIds.map((p) => p.pokemonId))
  }

  const allOwned = (await tx.ownedPokemon.findMany({
    where: { playerId: { in: playerIds } },
    select: { playerId: true, pokemonId: true },
  })) as { playerId: string; pokemonId: string }[]

  for (const item of allOwned) {
    if (pokemonIdsInPool.has(item.pokemonId)) {
      const current = counts.get(item.playerId) || 0
      counts.set(item.playerId, current + 1)
    }
  }

  return counts
}

export async function findNextValidTurn(
  tx: any,
  contestId: string,
  startTurn: number,
  draftOrder: string[],
  maxPokemon: number,
  basePrice: number,
): Promise<{ turn: number; shouldComplete: boolean }> {
  const numPlayers = draftOrder.length
  const uniquePlayerIds = [...new Set(draftOrder)]

  // 预查询池子，供后续批量计数使用
  const poolIds = (await tx.pokemonPool.findMany({
    where: { contestId },
    select: { pokemonId: true },
  })) as { pokemonId: string }[]
  const pokemonIdsInPool = new Set(poolIds.map((p) => p.pokemonId))

  // 批量查询所有玩家的计数
  const ownedCounts = await countOwnedInContestBatch(
    tx,
    contestId,
    uniquePlayerIds,
    pokemonIdsInPool,
  )

  // 第一步：检查是否还有任何玩家能继续（全局检查）
  let anyPlayerCanContinue = false
  // 批量获取玩家代币信息
  const playersInfo = (await tx.player.findMany({
    where: { id: { in: uniquePlayerIds } },
    select: { id: true, tokens: true },
  })) as { id: string; tokens: number }[]
  const playerTokensMap = new Map(playersInfo.map((p) => [p.id, p.tokens]))

  for (const playerId of uniquePlayerIds) {
    const tokens = playerTokensMap.get(playerId) ?? 0
    const ownedInContest = ownedCounts.get(playerId) || 0
    if (ownedInContest < maxPokemon && tokens >= basePrice) {
      anyPlayerCanContinue = true
      break
    }
  }
  if (!anyPlayerCanContinue) return { turn: startTurn, shouldComplete: true }

  // 第二步：从 startTurn 开始，找下一个能继续的玩家
  for (let attempt = 0; attempt < numPlayers * 2; attempt++) {
    const turn = startTurn + attempt
    const playerId = draftOrder[turn % draftOrder.length]
    const tokens = playerTokensMap.get(playerId) ?? 0
    const ownedInContest = ownedCounts.get(playerId) || 0
    if (ownedInContest >= maxPokemon || tokens < basePrice) continue
    return { turn, shouldComplete: false }
  }

  return { turn: startTurn, shouldComplete: true }
}

export async function executeAuctionFinalize(prisma: any, contestId: string) {
  return prisma.$transaction(async (tx: any) => {
    const contests = (await tx.$queryRaw`
            SELECT * FROM "Contest" WHERE id = ${contestId} FOR UPDATE
        `) as any[]
    if (!contests?.length) throw new Error('比赛未找到')
    const contest = {
      ...contests[0],
      draftOrder: contests[0].draftOrder as string[],
    }
    if (contest.auctionPhase !== 'BIDDING') throw new Error('ALREADY_FINALIZED')
    if (!contest.activePokemonId) throw new Error('ALREADY_FINALIZED')
    const hasTimeLimit = contest.bidEndTime != null
    if (hasTimeLimit && new Date() <= new Date(contest.bidEndTime)) {
      throw new Error('竞价尚未结束')
    }
    if (!contest.highestBidderId) throw new Error('无有效出价')
    const winnerRows = (await tx.$queryRaw`
            SELECT * FROM "Player" WHERE id = ${contest.highestBidderId} FOR UPDATE
        `) as any[]
    if (!winnerRows?.length) throw new Error('获胜者不存在')
    const winner = winnerRows[0] as { tokens: number }
    // Phase 3: Use countOwnedInContest for consistency and to avoid cross-contest bugs
    const ownedCount = await countOwnedInContest(
      tx,
      contestId,
      contest.highestBidderId,
    )
    if (winner.tokens < (contest.highestBid || 0)) {
      throw new Error(
        `获胜者余额不足 (当前: ${winner.tokens}, 需要: ${contest.highestBid})`,
      )
    }
    if (ownedCount >= contest.maxPokemonPerPlayer)
      throw new Error('获胜者已达宝可梦上限')
    const poolItem = await tx.pokemonPool.findUnique({
      where: { id: contest.activePokemonId },
      include: { pokemon: true },
    })
    if (!poolItem) throw new Error('宝可梦不存在')
    if (poolItem.status !== 'AVAILABLE') throw new Error('ALREADY_FINALIZED')
    await tx.pokemonPool.update({
      where: { id: contest.activePokemonId },
      data: { status: 'DRAFTED' },
    })
    await tx.ownedPokemon.create({
      data: {
        playerId: contest.highestBidderId,
        pokemonId: poolItem.pokemonId,
        purchasePrice: contest.highestBid,
      },
    })
    await tx.player.update({
      where: { id: contest.highestBidderId },
      data: { tokens: { decrement: contest.highestBid! } },
    })
    await tx.draftAction.create({
      data: {
        contestId,
        playerId: contest.highestBidderId,
        actionType: 'PICK',
        pokemonId: poolItem.pokemonId,
        details: {
          pokemonName: poolItem.pokemon.nameCn || poolItem.pokemon.name,
          cost: contest.highestBid,
          balance: winner.tokens - (contest.highestBid || 0),
          auctionWin: true,
        },
      },
    })
    // 用剩余可用池的最低起拍价判断是否还有人能继续，避免用 contest.auctionBasePrice 导致提前结束
    const remainingPool = await tx.pokemonPool.findMany({
      where: { contestId, status: 'AVAILABLE' },
      select: { basePrice: true },
    })
    let nextTurn: number
    let shouldComplete: boolean
    if (remainingPool.length === 0) {
      nextTurn = contest.currentTurn + 1
      shouldComplete = true
    } else {
      // 底价绝不为 0：至少为 1，与选手资格/比赛结束判断一致
      const minPoolPrice = Math.max(
        1,
        Math.min(
          ...remainingPool.map((p: { basePrice: number }) => p.basePrice),
        ),
      )
      const basePrice = minPoolPrice
      const result = await findNextValidTurn(
        tx,
        contestId,
        contest.currentTurn + 1,
        contest.draftOrder,
        contest.maxPokemonPerPlayer,
        basePrice,
      )
      nextTurn = result.turn
      shouldComplete = result.shouldComplete
    }
    const curVersion = contest.version ?? 0
    const finUpdated = await tx.$executeRaw`
            UPDATE "Contest" SET "auctionPhase" = ${shouldComplete ? null : 'NOMINATING'}, "activePokemonId" = NULL, "highestBid" = NULL, "highestBidderId" = NULL, "bidEndTime" = NULL, "currentTurn" = ${nextTurn}, "status" = ${shouldComplete ? 'COMPLETED' : 'ACTIVE'}, "version" = "version" + 1
            WHERE "id" = ${contestId} AND "version" = ${curVersion}
        `
    if (finUpdated === 0) throw new Error('ALREADY_FINALIZED')
    return {
      success: true,
      nextTurn,
      isCompleted: shouldComplete,
      winnerId: contest.highestBidderId,
      pokemonId: poolItem.pokemonId,
    }
  })
}
