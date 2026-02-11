/**
 * 竞价业务逻辑单元测试
 *
 * 所有测试直接调用 auction.ts 真实导出函数，通过 mock tx 对象模拟 Prisma 查询结果
 */

import { describe, it, expect, vi } from "vitest";
import {
  countOwnedInContest,
  countOwnedInContestBatch,
  findNextValidTurn,
  executeAuctionFinalize,
} from "./auction";

// ─── 工具函数 ──────────────────────────────────────────────────────

/** 构造 mock tx，按需覆盖各 model 的方法 */
function createMockTx(overrides: Record<string, any> = {}) {
  return {
    pokemonPool: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      ...overrides.pokemonPool,
    },
    ownedPokemon: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      ...overrides.ownedPokemon,
    },
    player: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      ...overrides.player,
    },
    draftAction: {
      create: vi.fn().mockResolvedValue({}),
      ...overrides.draftAction,
    },
    $queryRaw: overrides.$queryRaw ?? vi.fn().mockResolvedValue([]),
    $executeRaw: overrides.$executeRaw ?? vi.fn().mockResolvedValue(1),
    $transaction: overrides.$transaction,
  };
}

// ─── countOwnedInContest ────────────────────────────────────────────

describe("countOwnedInContest", () => {
  it("统计池内匹配的宝可梦数量", async () => {
    const tx = createMockTx({
      pokemonPool: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { pokemonId: "pk1" },
            { pokemonId: "pk2" },
            { pokemonId: "pk3" },
          ]),
      },
      ownedPokemon: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ pokemonId: "pk1" }, { pokemonId: "pk2" }]),
      },
    });

    const count = await countOwnedInContest(tx, "contest-1", "player-1");
    expect(count).toBe(2);
  });

  it("玩家无宝可梦时返回 0", async () => {
    const tx = createMockTx({
      pokemonPool: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ pokemonId: "pk1" }, { pokemonId: "pk2" }]),
      },
      ownedPokemon: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    });

    const count = await countOwnedInContest(tx, "contest-1", "player-1");
    expect(count).toBe(0);
  });

  it("跨比赛过滤：拥有的宝可梦不在本比赛池中时不计数", async () => {
    const tx = createMockTx({
      pokemonPool: {
        findMany: vi.fn().mockResolvedValue([{ pokemonId: "pk1" }]),
      },
      ownedPokemon: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ pokemonId: "pk9" }, { pokemonId: "pk10" }]),
      },
    });

    const count = await countOwnedInContest(tx, "contest-1", "player-1");
    expect(count).toBe(0);
  });

  it("传入 poolIdsCache 时不查询 pokemonPool", async () => {
    const poolFindMany = vi.fn();
    const tx = createMockTx({
      pokemonPool: { findMany: poolFindMany },
      ownedPokemon: {
        findMany: vi.fn().mockResolvedValue([{ pokemonId: "pk1" }]),
      },
    });

    const cache = new Set(["pk1", "pk2"]);
    const count = await countOwnedInContest(tx, "contest-1", "player-1", cache);

    expect(count).toBe(1);
    expect(poolFindMany).not.toHaveBeenCalled();
  });

  it("池子为空时返回 0", async () => {
    const tx = createMockTx({
      pokemonPool: { findMany: vi.fn().mockResolvedValue([]) },
      ownedPokemon: {
        findMany: vi.fn().mockResolvedValue([{ pokemonId: "pk1" }]),
      },
    });

    const count = await countOwnedInContest(tx, "contest-1", "player-1");
    expect(count).toBe(0);
  });
});

// ─── countOwnedInContestBatch ───────────────────────────────────────

describe("countOwnedInContestBatch", () => {
  it("正确批量统计多个玩家", async () => {
    const tx = createMockTx({
      pokemonPool: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { pokemonId: "pk1" },
            { pokemonId: "pk2" },
            { pokemonId: "pk3" },
          ]),
      },
      ownedPokemon: {
        findMany: vi.fn().mockResolvedValue([
          { playerId: "p1", pokemonId: "pk1" },
          { playerId: "p1", pokemonId: "pk9" }, // 不在池中
          { playerId: "p2", pokemonId: "pk1" },
          { playerId: "p2", pokemonId: "pk2" },
          { playerId: "p2", pokemonId: "pk3" },
          { playerId: "p3", pokemonId: "pk9" }, // 不在池中
        ]),
      },
    });

    const counts = await countOwnedInContestBatch(tx, "contest-1", [
      "p1",
      "p2",
      "p3",
    ]);

    expect(counts.get("p1")).toBe(1);
    expect(counts.get("p2")).toBe(3);
    expect(counts.get("p3")).toBe(0);
  });

  it("空玩家列表返回空 Map", async () => {
    const tx = createMockTx();

    const counts = await countOwnedInContestBatch(tx, "contest-1", []);
    expect(counts.size).toBe(0);
  });

  it("空池子时所有计数为 0", async () => {
    const tx = createMockTx({
      pokemonPool: { findMany: vi.fn().mockResolvedValue([]) },
      ownedPokemon: {
        findMany: vi.fn().mockResolvedValue([
          { playerId: "p1", pokemonId: "pk1" },
          { playerId: "p2", pokemonId: "pk2" },
        ]),
      },
    });

    const counts = await countOwnedInContestBatch(tx, "contest-1", [
      "p1",
      "p2",
    ]);

    expect(counts.get("p1")).toBe(0);
    expect(counts.get("p2")).toBe(0);
  });

  it("传入 poolIdsCache 时不查询 pokemonPool", async () => {
    const poolFindMany = vi.fn();
    const tx = createMockTx({
      pokemonPool: { findMany: poolFindMany },
      ownedPokemon: {
        findMany: vi.fn().mockResolvedValue([
          { playerId: "p1", pokemonId: "pk1" },
          { playerId: "p2", pokemonId: "pk2" },
        ]),
      },
    });

    const cache = new Set(["pk1"]);
    const counts = await countOwnedInContestBatch(
      tx,
      "contest-1",
      ["p1", "p2"],
      cache,
    );

    expect(counts.get("p1")).toBe(1);
    expect(counts.get("p2")).toBe(0);
    expect(poolFindMany).not.toHaveBeenCalled();
  });
});

// ─── findNextValidTurn ──────────────────────────────────────────────

describe("findNextValidTurn", () => {
  /** 构造 findNextValidTurn 专用的 mock tx */
  function createFindNextTx(
    poolPokemonIds: string[],
    ownedByPlayer: { playerId: string; pokemonId: string }[],
    players: { id: string; tokens: number }[],
  ) {
    return createMockTx({
      pokemonPool: {
        findMany: vi
          .fn()
          .mockResolvedValue(poolPokemonIds.map((id) => ({ pokemonId: id }))),
      },
      ownedPokemon: {
        findMany: vi.fn().mockResolvedValue(ownedByPlayer),
      },
      player: {
        findMany: vi.fn().mockResolvedValue(players),
      },
    });
  }

  it("跳过已满员玩家", async () => {
    // p1 拥有 6 只（已满），p2 拥有 3 只
    const tx = createFindNextTx(
      ["pk1", "pk2", "pk3", "pk4", "pk5", "pk6", "pk7"],
      [
        { playerId: "p1", pokemonId: "pk1" },
        { playerId: "p1", pokemonId: "pk2" },
        { playerId: "p1", pokemonId: "pk3" },
        { playerId: "p1", pokemonId: "pk4" },
        { playerId: "p1", pokemonId: "pk5" },
        { playerId: "p1", pokemonId: "pk6" },
        { playerId: "p2", pokemonId: "pk7" },
      ],
      [
        { id: "p1", tokens: 100 },
        { id: "p2", tokens: 100 },
      ],
    );

    const result = await findNextValidTurn(
      tx,
      "contest-1",
      0,
      ["p1", "p2"],
      6,
      10,
    );

    expect(result.turn).toBe(1); // p2
    expect(result.shouldComplete).toBe(false);
  });

  it("跳过代币不足玩家", async () => {
    const tx = createFindNextTx(
      ["pk1"],
      [],
      [
        { id: "p1", tokens: 5 }, // 不足 basePrice=10
        { id: "p2", tokens: 100 },
      ],
    );

    const result = await findNextValidTurn(
      tx,
      "contest-1",
      0,
      ["p1", "p2"],
      6,
      10,
    );

    expect(result.turn).toBe(1); // p2
    expect(result.shouldComplete).toBe(false);
  });

  it("所有玩家都无法继续时返回 shouldComplete: true", async () => {
    // 全部满员
    const tx = createFindNextTx(
      ["pk1", "pk2"],
      [
        { playerId: "p1", pokemonId: "pk1" },
        { playerId: "p2", pokemonId: "pk2" },
      ],
      [
        { id: "p1", tokens: 100 },
        { id: "p2", tokens: 100 },
      ],
    );

    const result = await findNextValidTurn(
      tx,
      "contest-1",
      0,
      ["p1", "p2"],
      1, // maxPokemon=1，每人只能选 1 只
      10,
    );

    expect(result.shouldComplete).toBe(true);
  });

  it("蛇形顺序（draftOrder 含重复 ID）", async () => {
    // p1 满员，p2 满员，p3 可用
    const tx = createFindNextTx(
      ["pk1", "pk2", "pk3", "pk4", "pk5", "pk6", "pk7"],
      [
        { playerId: "p1", pokemonId: "pk1" },
        { playerId: "p1", pokemonId: "pk2" },
        { playerId: "p2", pokemonId: "pk3" },
        { playerId: "p2", pokemonId: "pk4" },
      ],
      [
        { id: "p1", tokens: 100 },
        { id: "p2", tokens: 100 },
        { id: "p3", tokens: 100 },
      ],
    );

    const draftOrder = ["p1", "p2", "p3", "p3", "p2", "p1"];
    const result = await findNextValidTurn(
      tx,
      "contest-1",
      0,
      draftOrder,
      2, // maxPokemon=2
      10,
    );

    // p1 已满(2)，p2 已满(2)，p3 可用 → turn=2
    expect(result.turn).toBe(2);
    expect(result.shouldComplete).toBe(false);
  });

  it("从非零 startTurn 开始查找", async () => {
    const tx = createFindNextTx(
      ["pk1"],
      [],
      [
        { id: "p1", tokens: 100 },
        { id: "p2", tokens: 100 },
        { id: "p3", tokens: 100 },
      ],
    );

    const result = await findNextValidTurn(
      tx,
      "contest-1",
      5,
      ["p1", "p2", "p3"],
      6,
      10,
    );

    // startTurn=5, draftOrder.length=3, 5 % 3 = 2 → p3
    expect(result.turn).toBe(5);
    expect(result.shouldComplete).toBe(false);
  });

  it("环绕（wrap-around）查找", async () => {
    // p1 不可用（代币不足），p2 不可用（满员），p3 可用
    const tx = createFindNextTx(
      ["pk1", "pk2"],
      [{ playerId: "p2", pokemonId: "pk1" }],
      [
        { id: "p1", tokens: 5 }, // 不足
        { id: "p2", tokens: 100 },
        { id: "p3", tokens: 100 },
      ],
    );

    // startTurn=1 → draftOrder[1]=p2(满员, maxPokemon=1) → draftOrder[2]=p3(可用)
    const result = await findNextValidTurn(
      tx,
      "contest-1",
      1,
      ["p1", "p2", "p3"],
      1,
      10,
    );

    expect(result.turn).toBe(2);
    expect(result.shouldComplete).toBe(false);
  });
});

// ─── executeAuctionFinalize ─────────────────────────────────────────

describe("executeAuctionFinalize", () => {
  /** 构造一个默认可正常结算的 mock prisma，可按需覆盖 */
  function createFinalizePrisma(txOverrides: Record<string, any> = {}) {
    const defaultContest = {
      id: "contest-1",
      auctionPhase: "BIDDING",
      activePokemonId: "pool-1",
      highestBid: 20,
      highestBidderId: "player-1",
      bidEndTime: new Date(Date.now() - 10000), // 已过期
      currentTurn: 0,
      draftOrder: ["player-1", "player-2"],
      maxPokemonPerPlayer: 6,
      version: 1,
      auctionBasePrice: 10,
    };

    const defaultWinner = { id: "player-1", tokens: 100 };

    const defaultPoolItem = {
      id: "pool-1",
      pokemonId: "poke-1",
      status: "AVAILABLE",
      basePrice: 10,
      pokemon: { name: "Pikachu", nameCn: "皮卡丘" },
    };

    const innerTx = createMockTx({
      $queryRaw: vi
        .fn()
        // 第一次调用：查 Contest
        .mockResolvedValueOnce([txOverrides.contest ?? defaultContest])
        // 第二次调用：查 Winner Player
        .mockResolvedValueOnce([txOverrides.winner ?? defaultWinner]),
      pokemonPool: {
        findMany: vi.fn().mockImplementation(({ where }) => {
          // countOwnedInContest 调用（查 pool pokemonIds）
          if (where && !where.status) {
            return Promise.resolve([{ pokemonId: "poke-1" }]);
          }
          // 查剩余可用池
          return Promise.resolve(
            txOverrides.remainingPool ?? [{ basePrice: 10 }],
          );
        }),
        findUnique: vi
          .fn()
          .mockResolvedValue(txOverrides.poolItem ?? defaultPoolItem),
        update: vi.fn().mockResolvedValue({}),
      },
      ownedPokemon: {
        findMany: vi.fn().mockResolvedValue(txOverrides.ownedPokemon ?? []),
        create: vi.fn().mockResolvedValue({}),
      },
      player: {
        findMany: vi.fn().mockResolvedValue(
          txOverrides.players ?? [
            { id: "player-1", tokens: 80 },
            { id: "player-2", tokens: 100 },
          ],
        ),
        update: vi.fn().mockResolvedValue({}),
      },
      draftAction: { create: vi.fn().mockResolvedValue({}) },
      $executeRaw: vi.fn().mockResolvedValue(1),
    });

    // prisma.$transaction 直接执行回调
    const prisma = {
      $transaction: vi.fn(async (cb: (tx: any) => any) => cb(innerTx)),
    };

    return { prisma, innerTx };
  }

  it("正常结算流程：扣代币、创建 OwnedPokemon、标记 DRAFTED", async () => {
    const { prisma, innerTx } = createFinalizePrisma();

    const result = await executeAuctionFinalize(prisma, "contest-1");

    expect(result.success).toBe(true);
    expect(result.winnerId).toBe("player-1");
    expect(result.pokemonId).toBe("poke-1");

    // 验证扣代币
    expect(innerTx.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "player-1" },
        data: { tokens: { decrement: 20 } },
      }),
    );

    // 验证创建 OwnedPokemon
    expect(innerTx.ownedPokemon.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          playerId: "player-1",
          pokemonId: "poke-1",
          contestId: "contest-1",
          purchasePrice: 20,
        }),
      }),
    );

    // 验证标记 DRAFTED
    expect(innerTx.pokemonPool.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pool-1" },
        data: { status: "DRAFTED" },
      }),
    );
  });

  it("比赛不存在时抛错", async () => {
    const prisma = {
      $transaction: vi.fn(async (cb: (tx: any) => any) => {
        const tx = createMockTx({
          $queryRaw: vi.fn().mockResolvedValue([]),
        });
        return cb(tx);
      }),
    };

    await expect(executeAuctionFinalize(prisma, "nonexistent")).rejects.toThrow(
      "比赛未找到",
    );
  });

  it("非 BIDDING 阶段抛 ALREADY_FINALIZED", async () => {
    const prisma = {
      $transaction: vi.fn(async (cb: (tx: any) => any) => {
        const tx = createMockTx({
          $queryRaw: vi.fn().mockResolvedValue([
            {
              id: "contest-1",
              auctionPhase: "NOMINATING",
              activePokemonId: "pool-1",
            },
          ]),
        });
        return cb(tx);
      }),
    };

    await expect(executeAuctionFinalize(prisma, "contest-1")).rejects.toThrow(
      "ALREADY_FINALIZED",
    );
  });

  it("竞价尚未结束时抛错", async () => {
    const { prisma } = createFinalizePrisma({
      contest: {
        id: "contest-1",
        auctionPhase: "BIDDING",
        activePokemonId: "pool-1",
        highestBid: 20,
        highestBidderId: "player-1",
        bidEndTime: new Date(Date.now() + 60000), // 未来时间
        currentTurn: 0,
        draftOrder: ["player-1"],
        maxPokemonPerPlayer: 6,
        version: 1,
      },
    });

    await expect(executeAuctionFinalize(prisma, "contest-1")).rejects.toThrow(
      "竞价尚未结束",
    );
  });

  it("无有效出价时抛错", async () => {
    const { prisma } = createFinalizePrisma({
      contest: {
        id: "contest-1",
        auctionPhase: "BIDDING",
        activePokemonId: "pool-1",
        highestBid: null,
        highestBidderId: null,
        bidEndTime: new Date(Date.now() - 10000),
        currentTurn: 0,
        draftOrder: ["player-1"],
        maxPokemonPerPlayer: 6,
        version: 1,
      },
    });

    await expect(executeAuctionFinalize(prisma, "contest-1")).rejects.toThrow(
      "无有效出价",
    );
  });

  it("池子为空时 shouldComplete: true", async () => {
    const { prisma } = createFinalizePrisma({
      remainingPool: [], // 没有剩余可用池
    });

    const result = await executeAuctionFinalize(prisma, "contest-1");

    expect(result.isCompleted).toBe(true);
  });
});
