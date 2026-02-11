/**
 * DraftService 单元测试
 *
 * 通过 vi.mock 模拟 Prisma 和 DP 函数，直接调用 DraftService.startDraft
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock 外部依赖 ───────────────────────────────────────────────────

const mockFindUnique = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/app/lib/db/prisma", () => ({
  prisma: {
    contest: { findUnique: (...args: any[]) => mockFindUnique(...args) },
    $transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

vi.mock("@/app/lib/business/draft", () => ({
  checkTierCompleteness: vi.fn().mockReturnValue({ feasible: true }),
  checkTierCompletenessMinimal: vi.fn().mockReturnValue({ feasible: true }),
}));

// ─── 导入被测模块 ────────────────────────────────────────────────────

import { DraftService, DraftError } from "./draft-service";
import {
  checkTierCompleteness,
  checkTierCompletenessMinimal,
} from "@/app/lib/business/draft";

// ─── 工具函数 ──────────────────────────────────────────────────────

function makeContest(overrides: Record<string, any> = {}) {
  return {
    id: "contest-1",
    name: "测试比赛",
    status: "PENDING",
    draftMode: "SNAKE",
    maxPokemonPerPlayer: 6,
    playerTokens: 100,
    auctionBasePrice: 10,
    priceTiers: null,
    players: [
      { id: "p1", tokens: 100 },
      { id: "p2", tokens: 100 },
    ],
    pokemonPool: Array.from({ length: 20 }, (_, i) => ({
      id: `pool-${i}`,
      pokemonId: `poke-${i}`,
      status: "AVAILABLE",
    })),
    ...overrides,
  };
}

function setupFindUnique(contest: any) {
  mockFindUnique.mockResolvedValue(contest);
}

function setupTransactionSuccess() {
  mockTransaction.mockImplementation(async (cb: (tx: any) => any) => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      player: { update: vi.fn().mockResolvedValue({}) },
    };
    return cb(tx);
  });
}

// ─── 测试 ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setupTransactionSuccess();
});

describe("DraftError", () => {
  it("继承 AppError 并设置 name", () => {
    const err = new DraftError("msg", "CODE", "reason", "suggestion", 409);
    expect(err.name).toBe("DraftError");
    expect(err.code).toBe("CODE");
    expect(err.status).toBe(409);
  });
});

describe("DraftService.startDraft", () => {
  // ─── 基础校验 ─────────────────────────────────────────────────────

  it("比赛未找到 → 404", async () => {
    setupFindUnique(null);

    await expect(DraftService.startDraft("x")).rejects.toThrow("比赛未找到");
  });

  it("选手不足 → NOT_ENOUGH_PLAYERS", async () => {
    setupFindUnique(makeContest({ players: [{ id: "p1" }] }));

    await expect(DraftService.startDraft("contest-1")).rejects.toThrow(
      "至少需要2名选手",
    );
  });

  it("宝可梦池不足 → POOL_INSUFFICIENT", async () => {
    // 2 players × 6 = 12 needed, only 5 available
    setupFindUnique(
      makeContest({
        pokemonPool: Array.from({ length: 5 }, (_, i) => ({
          id: `pool-${i}`,
          pokemonId: `poke-${i}`,
          status: "AVAILABLE",
        })),
      }),
    );

    await expect(DraftService.startDraft("contest-1")).rejects.toThrow(
      "宝可梦池不足",
    );
  });

  // ─── Snake 模式校验 ───────────────────────────────────────────────

  it("Snake 模式未设置价格分档 → NO_PRICE_TIERS", async () => {
    setupFindUnique(makeContest({ draftMode: "SNAKE", priceTiers: null }));

    await expect(DraftService.startDraft("contest-1")).rejects.toThrow(
      "请先设置价格分档",
    );
  });

  it("Snake 模式有未分配宝可梦 → UNASSIGNED_POKEMON", async () => {
    // 只分配了 10 个宝可梦的 ID，但池子有 20 个
    const tiers = [
      {
        name: "S",
        price: 30,
        threshold: 30,
        pokemonIds: Array.from({ length: 10 }, (_, i) => `poke-${i}`),
      },
    ];
    setupFindUnique(makeContest({ draftMode: "SNAKE", priceTiers: tiers }));

    await expect(DraftService.startDraft("contest-1")).rejects.toThrow(
      "未分配价格分档",
    );
  });

  it("Snake 模式 DP 校验失败 → DP_VALIDATION_FAILED", async () => {
    const allPokemonIds = Array.from({ length: 20 }, (_, i) => `poke-${i}`);
    const tiers = [
      {
        name: "S",
        price: 90,
        threshold: 90,
        pokemonIds: allPokemonIds,
      },
    ];
    setupFindUnique(makeContest({ draftMode: "SNAKE", priceTiers: tiers }));
    vi.mocked(checkTierCompleteness).mockReturnValueOnce({
      feasible: false,
      reason: "代币不足以满足所有分档",
      details: [{ tierName: "S", canInclude: false }],
      suggestions: [{ reason: "降低 S 档价格" }],
    } as any);

    await expect(DraftService.startDraft("contest-1")).rejects.toThrow(
      "价格设置不完备",
    );
  });

  it("Snake 模式 dpTargetMode=MINIMUM 使用 checkTierCompletenessMinimal", async () => {
    const allPokemonIds = Array.from({ length: 20 }, (_, i) => `poke-${i}`);
    const priceTiers = {
      dpTargetMode: "MINIMUM",
      tiers: [
        { name: "S", price: 10, threshold: 10, pokemonIds: allPokemonIds },
      ],
    };
    setupFindUnique(makeContest({ draftMode: "SNAKE", priceTiers }));

    await DraftService.startDraft("contest-1");

    expect(checkTierCompletenessMinimal).toHaveBeenCalled();
    expect(checkTierCompleteness).not.toHaveBeenCalled();
  });

  // ─── Auction 模式校验 ─────────────────────────────────────────────

  it("Auction 模式代币不足 → AUCTION_TOKENS_INSUFFICIENT", async () => {
    // basePrice=10, max=6, minCost=60, but only 50 tokens
    setupFindUnique(
      makeContest({
        draftMode: "AUCTION",
        auctionBasePrice: 10,
        maxPokemonPerPlayer: 6,
        playerTokens: 50,
      }),
    );

    await expect(DraftService.startDraft("contest-1")).rejects.toThrow(
      "代币不足",
    );
  });

  // ─── 成功路径 ─────────────────────────────────────────────────────

  it("Snake 成功：返回蛇形 draftOrder", async () => {
    const allPokemonIds = Array.from({ length: 20 }, (_, i) => `poke-${i}`);
    const tiers = [
      { name: "S", price: 10, threshold: 10, pokemonIds: allPokemonIds },
    ];
    setupFindUnique(
      makeContest({
        draftMode: "SNAKE",
        priceTiers: tiers,
        maxPokemonPerPlayer: 2,
      }),
    );

    const result = await DraftService.startDraft("contest-1");

    expect(result.success).toBe(true);
    expect(result.draftMode).toBe("SNAKE");
    // 2 players × 2 rounds = 4 entries in draftOrder
    expect(result.draftOrder).toHaveLength(4);
    // 蛇形：第二轮是反序
    const first = result.draftOrder[0];
    const second = result.draftOrder[1];
    expect(result.draftOrder[2]).toBe(second); // 反转
    expect(result.draftOrder[3]).toBe(first); // 反转
  });

  it("Auction 成功：返回 round-robin draftOrder", async () => {
    setupFindUnique(
      makeContest({
        draftMode: "AUCTION",
        playerTokens: 100,
        auctionBasePrice: 10,
        maxPokemonPerPlayer: 2,
      }),
    );

    const result = await DraftService.startDraft("contest-1");

    expect(result.success).toBe(true);
    expect(result.draftMode).toBe("AUCTION");
    // 2 players × 2 rounds = 4, round-robin 每轮相同顺序
    expect(result.draftOrder).toHaveLength(4);
    expect(result.draftOrder[0]).toBe(result.draftOrder[2]);
    expect(result.draftOrder[1]).toBe(result.draftOrder[3]);
  });

  it("并发启动 → CONTEST_ALREADY_STARTED (409)", async () => {
    const allPokemonIds = Array.from({ length: 20 }, (_, i) => `poke-${i}`);
    const tiers = [
      { name: "S", price: 10, threshold: 10, pokemonIds: allPokemonIds },
    ];
    setupFindUnique(makeContest({ draftMode: "SNAKE", priceTiers: tiers }));

    // $executeRaw 返回 0 → 没有更新任何行
    mockTransaction.mockImplementation(async (cb: (tx: any) => any) => {
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(0),
        player: { update: vi.fn() },
      };
      return cb(tx);
    });

    await expect(DraftService.startDraft("contest-1")).rejects.toThrow(
      "比赛已开始或状态已变更",
    );
  });
});
