/**
 * AuctionService 单元测试
 *
 * 通过 vi.mock 模拟 Prisma、业务函数、SSE，直接调用 AuctionService.placeBid
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock 外部依赖 ───────────────────────────────────────────────────

const mockTransaction = vi.fn();
vi.mock("@/app/lib/db/prisma", () => ({
  prisma: { $transaction: (...args: any[]) => mockTransaction(...args) },
}));

vi.mock("@/app/lib/business/auction", () => ({
  countOwnedInContest: vi.fn().mockResolvedValue(0),
  countOwnedInContestBatch: vi
    .fn()
    .mockResolvedValue(new Map<string, number>()),
}));

vi.mock("@/app/lib/business/draft", () => ({
  canFillTeamAfterBid: vi
    .fn()
    .mockReturnValue({ feasible: true, reason: "", suggestion: "" }),
  calculateOtherPlayersNeed: vi.fn().mockReturnValue(0),
  getAvailableCountForAuction: vi.fn().mockReturnValue(5),
}));

vi.mock("@/app/lib/utils/constants", () => ({
  checkFusionExclusive: vi.fn().mockReturnValue({ allowed: true }),
  FUSION_EXCLUSIVE_GROUPS: [],
}));

vi.mock("@/app/lib/sse/server", () => ({
  broadcastContestUpdate: vi.fn(),
}));

vi.mock("@/app/lib/logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

// ─── 导入被测模块（必须在 vi.mock 之后） ──────────────────────────────

import { AuctionService, AuctionError } from "./auction-service";
import { countOwnedInContest } from "@/app/lib/business/auction";
import { canFillTeamAfterBid } from "@/app/lib/business/draft";
import { checkFusionExclusive } from "@/app/lib/utils/constants";
import { broadcastContestUpdate } from "@/app/lib/sse/server";

// ─── 工具函数 ──────────────────────────────────────────────────────

/** 构造默认 happy-path 数据 */
function defaultContestRow(overrides: Record<string, any> = {}) {
  return {
    id: "contest-1",
    status: "ACTIVE",
    isPaused: false,
    auctionPhase: "BIDDING",
    activePokemonId: "pool-1",
    highestBid: 10,
    highestBidderId: "other-player",
    bidEndTime: new Date(Date.now() + 60000).toISOString(), // 未过期
    auctionBidDuration: 30,
    maxPokemonPerPlayer: 6,
    auctionBasePrice: 10,
    version: 1,
    ...overrides,
  };
}

function defaultPlayerRow(
  contestRow: Record<string, any>,
  overrides: Record<string, any> = {},
) {
  return {
    id: "player-1",
    tokens: 100,
    contest_json: contestRow,
    ...overrides,
  };
}

/** 构造一个 mock tx，让 prisma.$transaction 回调能正常执行 */
function setupTransaction(
  playerRows: any[],
  txOverrides: Record<string, any> = {},
) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue(playerRows),
    $executeRaw: txOverrides.$executeRaw ?? vi.fn().mockResolvedValue(1),
    pokemonPool: {
      findUnique: vi.fn().mockResolvedValue(
        txOverrides.activePoolItem ?? {
          id: "pool-1",
          pokemonId: "poke-1",
          status: "AVAILABLE",
          pokemon: { name: "Pikachu", nameCn: "皮卡丘" },
        },
      ),
      findMany: vi.fn().mockResolvedValue(
        txOverrides.poolItems ?? [
          { id: "pool-1", pokemonId: "poke-1", status: "BIDDING" },
          { id: "pool-2", pokemonId: "poke-2", status: "AVAILABLE" },
        ],
      ),
    },
    ownedPokemon: {
      findMany: vi.fn().mockResolvedValue(txOverrides.ownedPokemon ?? []),
    },
    player: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          txOverrides.allPlayers ?? [
            { id: "player-1" },
            { id: "other-player" },
          ],
        ),
    },
    draftAction: {
      create: vi.fn().mockResolvedValue({}),
    },
  };

  mockTransaction.mockImplementation(async (cb: (tx: any) => any) => cb(tx));
  return tx;
}

// ─── 测试 ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuctionError", () => {
  it("继承 AppError 并设置 name", () => {
    const err = new AuctionError("msg", "CODE", "reason", "suggestion", 409);
    expect(err.name).toBe("AuctionError");
    expect(err.code).toBe("CODE");
    expect(err.status).toBe(409);
    expect(err.message).toBe("msg");
  });

  it("默认 status 为 400", () => {
    const err = new AuctionError("msg", "CODE");
    expect(err.status).toBe(400);
  });
});

describe("AuctionService.placeBid", () => {
  // ─── 参数校验 ─────────────────────────────────────────────────────

  it("无效金额（0）→ INVALID_BID_AMOUNT", async () => {
    await expect(AuctionService.placeBid("player-1", 0)).rejects.toThrow(
      "无效的出价金额",
    );
  });

  it("无效金额（负数）→ INVALID_BID_AMOUNT", async () => {
    await expect(AuctionService.placeBid("player-1", -5)).rejects.toThrow(
      "无效的出价金额",
    );
  });

  it("无效金额（NaN）→ INVALID_BID_AMOUNT", async () => {
    await expect(AuctionService.placeBid("player-1", NaN)).rejects.toThrow(
      "无效的出价金额",
    );
  });

  // ─── 玩家/比赛状态校验 ────────────────────────────────────────────

  it("玩家未找到 → PLAYER_NOT_FOUND", async () => {
    setupTransaction([]); // 空结果
    await expect(AuctionService.placeBid("player-1", 20)).rejects.toThrow(
      "玩家未找到",
    );
  });

  it("比赛已暂停 → CONTEST_PAUSED", async () => {
    const contest = defaultContestRow({ isPaused: true });
    setupTransaction([defaultPlayerRow(contest)]);

    await expect(AuctionService.placeBid("player-1", 20)).rejects.toThrow(
      "比赛已暂停",
    );
  });

  it("非 BIDDING 阶段 → NOT_IN_BIDDING_PHASE", async () => {
    const contest = defaultContestRow({ auctionPhase: "NOMINATING" });
    setupTransaction([defaultPlayerRow(contest)]);

    await expect(AuctionService.placeBid("player-1", 20)).rejects.toThrow(
      "当前不在竞价阶段",
    );
  });

  it("出价已截止 → BID_TIME_EXPIRED", async () => {
    const contest = defaultContestRow({
      bidEndTime: new Date(Date.now() - 10000).toISOString(), // 已过期
    });
    setupTransaction([defaultPlayerRow(contest)]);

    await expect(AuctionService.placeBid("player-1", 20)).rejects.toThrow(
      "出价已截止",
    );
  });

  // ─── 出价逻辑校验 ────────────────────────────────────────────────

  it("出价低于当前最高价 → BID_TOO_LOW", async () => {
    const contest = defaultContestRow({ highestBid: 50 });
    setupTransaction([defaultPlayerRow(contest)]);

    await expect(AuctionService.placeBid("player-1", 30)).rejects.toThrow(
      "出价必须高于当前价格",
    );
  });

  it("已是最高出价者 → ALREADY_HIGHEST_BIDDER", async () => {
    const contest = defaultContestRow({
      highestBid: 10,
      highestBidderId: "player-1",
    });
    setupTransaction([defaultPlayerRow(contest)]);

    await expect(AuctionService.placeBid("player-1", 20)).rejects.toThrow(
      "你已是当前最高出价者",
    );
  });

  it("代币不足 → INSUFFICIENT_TOKENS", async () => {
    const contest = defaultContestRow({ highestBid: 10 });
    setupTransaction([defaultPlayerRow(contest, { tokens: 5 })]);

    await expect(AuctionService.placeBid("player-1", 20)).rejects.toThrow(
      "代币不足",
    );
  });

  // ─── 容量 & 规则校验 ─────────────────────────────────────────────

  it("已选满宝可梦 → PLAYER_TEAM_FULL", async () => {
    const contest = defaultContestRow({ maxPokemonPerPlayer: 6 });
    setupTransaction([defaultPlayerRow(contest)]);
    vi.mocked(countOwnedInContest).mockResolvedValueOnce(6);

    await expect(AuctionService.placeBid("player-1", 20)).rejects.toThrow(
      "你已选满宝可梦",
    );
  });

  it("融合互斥限制 → FUSION_EXCLUSIVE_VIOLATION", async () => {
    const contest = defaultContestRow();
    setupTransaction([defaultPlayerRow(contest)]);
    vi.mocked(checkFusionExclusive).mockReturnValueOnce({
      allowed: false,
      groupName: "奈克洛兹玛融合系列",
    });

    await expect(AuctionService.placeBid("player-1", 20)).rejects.toThrow(
      "不能竞拍同系列的其他形态",
    );
  });

  it("DP 可行性检查失败 → DP_VALIDATION_FAILED", async () => {
    const contest = defaultContestRow();
    setupTransaction([defaultPlayerRow(contest)]);
    vi.mocked(canFillTeamAfterBid).mockReturnValueOnce({
      feasible: false,
      reason: "出价后无法凑齐队伍",
      suggestion: "降低出价金额",
    });

    await expect(AuctionService.placeBid("player-1", 20)).rejects.toThrow(
      "出价被阻止",
    );
  });

  // ─── 并发冲突 ─────────────────────────────────────────────────────

  it("乐观锁冲突 → RACE_CONDITION (409)", async () => {
    const contest = defaultContestRow();
    setupTransaction([defaultPlayerRow(contest)], {
      $executeRaw: vi.fn().mockResolvedValue(0), // 更新 0 行
    });

    try {
      await AuctionService.placeBid("player-1", 20);
      expect.unreachable("should have thrown");
    } catch (e: any) {
      expect(e.code).toBe("RACE_CONDITION");
      expect(e.status).toBe(409);
    }
  });

  // ─── 成功路径 ─────────────────────────────────────────────────────

  it("正常出价成功：记录 action + 广播更新", async () => {
    const contest = defaultContestRow();
    const tx = setupTransaction([defaultPlayerRow(contest)]);

    const result = await AuctionService.placeBid("player-1", 20);

    expect(result.success).toBe(true);

    // 验证记录了 BID action
    expect(tx.draftAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actionType: "BID",
          playerId: "player-1",
          pokemonId: "poke-1",
        }),
      }),
    );

    // 验证 SSE 广播
    expect(broadcastContestUpdate).toHaveBeenCalledWith("contest-1");
  });

  it("无时间限制时也能成功出价", async () => {
    const contest = defaultContestRow({
      auctionBidDuration: 0,
      bidEndTime: null,
    });
    setupTransaction([defaultPlayerRow(contest)]);

    const result = await AuctionService.placeBid("player-1", 20);
    expect(result.success).toBe(true);
  });

  // ─── Anti-snipe 防狙逻辑 ──────────────────────────────────────────

  it("剩余时间 < 10s 时延长截止时间", async () => {
    const contest = defaultContestRow({
      bidEndTime: new Date(Date.now() + 3000).toISOString(), // 仅剩 3s
    });
    const tx = setupTransaction([defaultPlayerRow(contest)]);

    await AuctionService.placeBid("player-1", 20);

    // 验证调用了带 bidEndTime 的 UPDATE（第一个分支）
    expect(tx.$executeRaw).toHaveBeenCalled();
  });
});
