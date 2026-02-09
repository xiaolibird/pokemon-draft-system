import { prisma } from "@/app/lib/db/prisma";

// Store active connections per contest for broadcasting
// In production, use Redis pub/sub for multi-instance support
export const contestConnections = new Map<
  string,
  Set<ReadableStreamDefaultController>
>();

const MAX_CONNECTIONS_PER_CONTEST =
  process.env.NODE_ENV === "development" ? 1000 : 100;

/** 同一 contest 200ms 内只广播一次，合并短时间内的多次更新 */
const BROADCAST_THROTTLE_MS = 200;
const lastBroadcastTime = new Map<string, number>();
/** 上次广播的 payload 字符串，相同则跳过（只发差分语义：无变化不推送） */
const lastBroadcastPayload = new Map<string, string>();

// SSE Heartbeat and Pruning Logic
if (
  typeof setInterval !== "undefined" &&
  !(global as any)._sseHeartbeatStarted
) {
  (global as any)._sseHeartbeatStarted = true;
  setInterval(() => {
    const encoder = new TextEncoder();
    const heartbeatData = encoder.encode(": heartbeat\n\n");

    for (const [contestId, connections] of contestConnections.entries()) {
      const deadConnections: ReadableStreamDefaultController[] = [];
      for (const controller of connections) {
        try {
          controller.enqueue(heartbeatData);
        } catch {
          deadConnections.push(controller);
        }
      }

      if (deadConnections.length > 0) {
        console.log(
          `[SSE] Pruning ${deadConnections.length} dead connections for contest ${contestId}`,
        );
        deadConnections.forEach((c) => connections.delete(c));
        if (connections.size === 0) {
          contestConnections.delete(contestId);
          lastBroadcastTime.delete(contestId);
          lastBroadcastPayload.delete(contestId);
        }
      }
    }
  }, 30000);
}

/**
 * 优化：根据场景决定是全量查询还是轻量查询
 */
async function buildContestStatePayload(
  contestId: string,
  mode: "FULL" | "OPTIMIZED" | "AUTO" = "AUTO",
) {
  if (mode === "AUTO") {
    mode = "OPTIMIZED";
  }

  let payload: any = null;

  if (mode === "OPTIMIZED") {
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
        draftOrder: true,
        maxPokemonPerPlayer: true,
        name: true,
        isPaused: true,
        auctionBidDuration: true,
        priceTiers: true,
      },
    });

    if (!contest) return null;

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
              },
            },
          },
        },
      },
    });

    const pokemonPool = await prisma.pokemonPool.findMany({
      where: { contestId },
      select: {
        id: true,
        status: true,
        basePrice: true,
      },
      orderBy: { id: "asc" },
    });

    let auctionExpired = false;
    if (
      contest.draftMode === "AUCTION" &&
      contest.auctionPhase === "BIDDING" &&
      contest.bidEndTime
    ) {
      auctionExpired = new Date() > new Date(contest.bidEndTime);
    }

    payload = {
      type: "partial",
      contest: { ...contest, auctionExpired },
      players,
      pokemonPool,
      timestamp: Date.now(),
    };
  } else {
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
    if (!contest) return null;

    let auctionExpired = false;
    const c = contest as any;
    if (
      c.draftMode === "AUCTION" &&
      c.auctionPhase === "BIDDING" &&
      c.bidEndTime
    ) {
      auctionExpired = new Date() > new Date(c.bidEndTime);
    }

    payload = {
      type: "state",
      contest: { ...contest, auctionExpired },
      timestamp: Date.now(),
    };
  }

  return payload;
}

/**
 * Send current contest state to a specific controller
 */
export async function sendContestState(
  contestId: string,
  controller: ReadableStreamDefaultController,
  mode: "FULL" | "OPTIMIZED" = "FULL",
) {
  try {
    const data = await buildContestStatePayload(contestId, mode);
    if (!data) return;
    const encoder = new TextEncoder();
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Controller is already closed")
    ) {
      return;
    }
    console.error("Error sending contest state:", error);
  }
}

/**
 * Broadcast update to all connected clients for a contest
 */
export async function broadcastContestUpdate(contestId: string) {
  try {
    const connections = contestConnections.get(contestId);
    if (!connections || connections.size === 0) return;

    const now = Date.now();
    if (now - (lastBroadcastTime.get(contestId) ?? 0) < BROADCAST_THROTTLE_MS)
      return;

    const data = await buildContestStatePayload(contestId, "AUTO");
    if (!data) return;

    const payloadStr = JSON.stringify(data);
    if (lastBroadcastPayload.get(contestId) === payloadStr) return;

    lastBroadcastTime.set(contestId, now);
    lastBroadcastPayload.set(contestId, payloadStr);

    const payload = `data: ${payloadStr}\n\n`;
    const encoded = new TextEncoder().encode(payload);

    for (const controller of [...connections]) {
      try {
        controller.enqueue(encoded);
      } catch {
        // Ignore errors for closed connections
      }
    }
  } catch (err) {
    console.error("[broadcastContestUpdate]", contestId, err);
  }
}

/**
 * Get the number of active connections for a contest
 */
export function getConnectionCount(contestId: string): number {
  return contestConnections.get(contestId)?.size || 0;
}

export function registerConnection(
  contestId: string,
  controller: ReadableStreamDefaultController,
) {
  if (!contestConnections.has(contestId)) {
    contestConnections.set(contestId, new Set());
  }
  const connections = contestConnections.get(contestId)!;
  if (connections.size >= MAX_CONNECTIONS_PER_CONTEST) {
    throw new Error("Too many connections");
  }
  connections.add(controller);
}

export function unregisterConnection(
  contestId: string,
  controller: ReadableStreamDefaultController,
) {
  const connections = contestConnections.get(contestId);
  if (connections) {
    connections.delete(controller);
    if (connections.size === 0) {
      contestConnections.delete(contestId);
      lastBroadcastTime.delete(contestId);
      lastBroadcastPayload.delete(contestId);
    }
  }
}
