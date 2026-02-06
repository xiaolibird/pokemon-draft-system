import { verifyToken } from '@/app/lib/auth/jwt'
import { prisma } from '@/app/lib/db/prisma'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * Server-Sent Events (SSE) endpoint for real-time contest updates
 *
 * This replaces polling by allowing the server to push updates to clients.
 * Clients establish a single long-lived connection instead of making
 * requests every 2 seconds.
 *
 * Benefits:
 * - Reduces server load by ~90%
 * - Lower latency for updates
 * - More efficient bandwidth usage
 */

// Store active connections per contest for broadcasting
// In production, use Redis pub/sub for multi-instance support
const contestConnections = new Map<
  string,
  Set<ReadableStreamDefaultController>
>()
const MAX_CONNECTIONS_PER_CONTEST =
  process.env.NODE_ENV === 'development' ? 1000 : 100 // Dev: 1000, Prod: 100

/** 同一 contest 200ms 内只广播一次，合并短时间内的多次更新 */
const BROADCAST_THROTTLE_MS = 200
const lastBroadcastTime = new Map<string, number>()
/** 上次广播的 payload 字符串，相同则跳过（只发差分语义：无变化不推送） */
const lastBroadcastPayload = new Map<string, string>()

// Phase 3: 定期清理死连接和发送心跳（每30秒）
if (
  typeof setInterval !== 'undefined' &&
  !(global as any)._sseHeartbeatStarted
) {
  ;(global as any)._sseHeartbeatStarted = true
  setInterval(() => {
    const encoder = new TextEncoder()
    const heartbeatData = encoder.encode(': heartbeat\n\n')

    for (const [contestId, connections] of contestConnections.entries()) {
      const deadConnections: ReadableStreamDefaultController[] = []
      for (const controller of connections) {
        try {
          controller.enqueue(heartbeatData)
        } catch {
          deadConnections.push(controller)
        }
      }

      if (deadConnections.length > 0) {
        console.log(
          `[SSE] Pruning ${deadConnections.length} dead connections for contest ${contestId}`,
        )
        deadConnections.forEach((c) => connections.delete(c))
        if (connections.size === 0) {
          contestConnections.delete(contestId)
          lastBroadcastTime.delete(contestId)
          lastBroadcastPayload.delete(contestId)
        }
      }
    }
  }, 30000)
}

/**
 * 优化：根据场景决定是全量查询还是轻量查询
 */
/**
 * 优化：根据场景决定是全量查询还是轻量查询 (OPTIMIZED)
 */
async function buildContestStatePayload(
  contestId: string,
  mode: 'FULL' | 'OPTIMIZED' | 'AUTO' = 'AUTO',
) {
  // 1. 自动模式判断
  if (mode === 'AUTO') {
    // 默认广播使用 OPTIMIZED 模式 (只发送动态数据，带宽极小)
    // 仅在初始连接 (GET 请求中) 显式调用时使用 FULL 模式
    mode = 'OPTIMIZED'
  }

  let payload: any = null

  if (mode === 'OPTIMIZED') {
    // 优化模式：只查询动态数据，极大减少带宽
    // 1. Contest: 关键动态字段
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      select: {
        id: true,
        status: true,
        auctionPhase: true,
        currentTurn: true,
        activePokemonId: true,
        highestBid: true,
        highestBidderId: true,
        bidEndTime: true,
        version: true,
        draftMode: true,
      },
    })

    if (!contest) return null

    // 2. Players: 包含 Sidebar 所需的动态数据 (Token, Online Status, Owned Icons)
    // 相比 FULL 模式，这里只取图标所需的最小字段
    const players = await prisma.player.findMany({
      where: { contestId },
      select: {
        id: true,
        username: true,
        tokens: true,
        lastSeenAt: true,
        contestId: true,
        _count: { select: { ownedPokemon: true } },
        ownedPokemon: {
          select: {
            id: true,
            pokemon: {
              select: {
                num: true,
                name: true,
                nameCn: true,
                // stat icons don't need types/stats, just num/name for sprite
              },
            },
          },
        },
      },
    })

    // 3. Pokemon Pool: 只返回 ID 和 Status (前端会 Smart Merge 保留静态数据)
    // 这是最大的优化点 (去除~200KB 的静态文本)
    const pokemonPool = await prisma.pokemonPool.findMany({
      where: { contestId },
      select: {
        id: true,
        status: true,
      },
      // order not strictly needed for merge, but good for consistency
      orderBy: { id: 'asc' },
    })

    let auctionExpired = false
    if (
      contest.draftMode === 'AUCTION' &&
      contest.auctionPhase === 'BIDDING' &&
      contest.bidEndTime
    ) {
      auctionExpired = new Date() > new Date(contest.bidEndTime)
    }

    payload = {
      type: 'partial', // 前端通过 smart merge 处理
      contest: { ...contest, auctionExpired },
      players,
      pokemonPool,
      timestamp: Date.now(),
    }
  } else {
    // 全量模式：查询所有关联数据 (仅初次连接使用)
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
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
                // Add other necessary fields for PokemonCard display
              },
            },
          },
          orderBy: [{ pokemon: { bst: 'desc' } }, { pokemon: { id: 'asc' } }],
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
                purchasePrice: true, // Needed for team value calc
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
    })
    if (!contest) return null

    const c = contest as any
    let auctionExpired = false
    if (
      c.draftMode === 'AUCTION' &&
      c.auctionPhase === 'BIDDING' &&
      c.bidEndTime
    ) {
      auctionExpired = new Date() > new Date(c.bidEndTime)
    }

    payload = {
      type: 'state', // 全量覆盖
      contest: { ...contest, auctionExpired },
      timestamp: Date.now(),
    }
  }

  return payload
}

/**
 * Send current contest state to a specific controller
 */
/**
 * Send current contest state to a specific controller
 */
async function sendContestState(
  contestId: string,
  controller: ReadableStreamDefaultController,
  mode: 'FULL' | 'OPTIMIZED' = 'FULL',
) {
  try {
    const data = await buildContestStatePayload(contestId, mode)
    if (!data) return
    const encoder = new TextEncoder()
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  } catch (error) {
    // Ignore "Controller is already closed" error which happens on client disconnect
    if (
      error instanceof Error &&
      error.message.includes('Controller is already closed')
    ) {
      return
    }
    console.error('Error sending contest state:', error)
  }
}

/**
 * Broadcast update to all connected clients for a contest
 * 优化：节流（200ms 内只发一次）+ 无变化不推送（只发差分）
 */
export async function broadcastContestUpdate(contestId: string) {
  try {
    const connections = contestConnections.get(contestId)
    if (!connections || connections.size === 0) return

    const now = Date.now()
    if (now - (lastBroadcastTime.get(contestId) ?? 0) < BROADCAST_THROTTLE_MS)
      return

    const data = await buildContestStatePayload(contestId, 'AUTO')
    if (!data) return

    const payloadStr = JSON.stringify(data)
    if (lastBroadcastPayload.get(contestId) === payloadStr) return

    lastBroadcastTime.set(contestId, now)
    lastBroadcastPayload.set(contestId, payloadStr)

    const payload = `data: ${payloadStr}\n\n`
    const encoded = new TextEncoder().encode(payload)

    for (const controller of [...connections]) {
      try {
        controller.enqueue(encoded)
      } catch {
        // 连接已关闭，忽略
      }
    }
  } catch (err) {
    console.error('[broadcastContestUpdate]', contestId, err)
  }
}

/**
 * Get the number of active connections for a contest
 */
export function getConnectionCount(contestId: string): number {
  return contestConnections.get(contestId)?.size || 0
}

export async function GET(request: Request, context: any) {
  const { id: contestId } = await context.params

  // Verify authorization
  const cookieStore = await cookies()
  const adminToken = cookieStore.get('admin_token')?.value
  const playerToken = cookieStore.get('player_token')?.value

  if (!adminToken && !playerToken) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  // Verify token and check contest access
  let hasAccess = false

  if (adminToken) {
    try {
      const payload = await verifyToken(adminToken)
      if (payload && payload.role === 'admin') {
        // Admin can access any contest they created
        const contest = await prisma.contest.findFirst({
          where: {
            id: contestId,
            adminId: payload.id as string,
          },
        })
        hasAccess = !!contest
      }
    } catch (err) {
      console.error('Admin token verification failed:', err)
    }
  }

  if (!hasAccess && playerToken) {
    try {
      const payload = await verifyToken(playerToken)
      if (payload && payload.role === 'player') {
        // Player can only access their own contest
        const player = await prisma.player.findFirst({
          where: {
            id: payload.id as string,
            contestId: contestId,
          },
        })
        hasAccess = !!player
      }
    } catch (err) {
      console.error('Player token verification failed:', err)
    }
  }

  if (!hasAccess) {
    return NextResponse.json({ error: '无权访问此比赛' }, { status: 403 })
  }

  // Verify contest exists (redundant check, but kept for safety)
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
  })

  if (!contest) {
    return NextResponse.json({ error: '比赛未找到' }, { status: 404 })
  }

  // Create SSE stream（用 ref 供 start/cancel 共用，便于 cancel 时清理连接）
  let controllerRef: ReadableStreamDefaultController | null = null
  const stream = new ReadableStream({
    start(controller) {
      controllerRef = controller
      if (!contestConnections.has(contestId)) {
        contestConnections.set(contestId, new Set())
      }
      const connections = contestConnections.get(contestId)!
      if (connections.size >= MAX_CONNECTIONS_PER_CONTEST) {
        controller.error(new Error('Too many connections'))
        return
      }
      connections.add(controller)

      const encoder = new TextEncoder()
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'connected', contestId })}\n\n`,
        ),
      )
      sendContestState(contestId, controller, 'FULL')

      const cleanup = () => {
        if (controllerRef) {
          contestConnections.get(contestId)?.delete(controllerRef)
          controllerRef = null
        }
        if (contestConnections.get(contestId)?.size === 0) {
          contestConnections.delete(contestId)
          lastBroadcastTime.delete(contestId)
          lastBroadcastPayload.delete(contestId)
        }
      }
      request.signal.addEventListener('abort', cleanup)
    },
    cancel() {
      if (controllerRef) {
        contestConnections.get(contestId)?.delete(controllerRef)
        controllerRef = null
      }
      if (contestConnections.get(contestId)?.size === 0) {
        contestConnections.delete(contestId)
        lastBroadcastTime.delete(contestId)
        lastBroadcastPayload.delete(contestId)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
