/**
 * SSE Server 单元测试
 *
 * 测试连接管理、状态推送、广播去重/节流
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock Prisma ─────────────────────────────────────────────────────

const mockContestFindUnique = vi.fn();
const mockPlayerFindMany = vi.fn();
const mockPoolFindMany = vi.fn();

vi.mock("@/app/lib/db/prisma", () => ({
  prisma: {
    contest: { findUnique: (...args: any[]) => mockContestFindUnique(...args) },
    player: { findMany: (...args: any[]) => mockPlayerFindMany(...args) },
    pokemonPool: { findMany: (...args: any[]) => mockPoolFindMany(...args) },
  },
}));

// ─── 导入被测模块 ────────────────────────────────────────────────────

import {
  contestConnections,
  registerConnection,
  unregisterConnection,
  getConnectionCount,
  sendContestState,
  broadcastContestUpdate,
} from "./server";

// ─── 辅助工具 ────────────────────────────────────────────────────────

function createMockController(): ReadableStreamDefaultController {
  return {
    enqueue: vi.fn(),
    close: vi.fn(),
    desiredSize: 1,
    error: vi.fn(),
  } as unknown as ReadableStreamDefaultController;
}

/** 构造一个最小的 OPTIMIZED 模式 contest 返回值 */
function mockOptimizedContest(overrides: Record<string, any> = {}) {
  return {
    id: "c-1",
    status: "ACTIVE",
    auctionPhase: "IDLE",
    currentTurn: 0,
    activePokemonId: null,
    highestBid: null,
    highestBidderId: null,
    bidEndTime: null,
    version: 1,
    draftMode: "SNAKE",
    draftOrder: [],
    maxPokemonPerPlayer: 6,
    name: "Test Contest",
    isPaused: false,
    auctionBidDuration: 30,
    priceTiers: null,
    ...overrides,
  };
}

/** 构造一个 FULL 模式 contest 返回值 */
function mockFullContest(overrides: Record<string, any> = {}) {
  return {
    id: "c-1",
    status: "ACTIVE",
    draftMode: "SNAKE",
    auctionPhase: "IDLE",
    bidEndTime: null,
    pokemonPool: [],
    players: [],
    ...overrides,
  };
}

// ─── 测试 ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // 通过 unregisterConnection 正确清理，触发内部 lastBroadcastTime/lastBroadcastPayload 清理
  for (const [contestId, controllers] of [...contestConnections.entries()]) {
    for (const ctrl of [...controllers]) {
      unregisterConnection(contestId, ctrl);
    }
  }
});

afterEach(() => {
  vi.useRealTimers();
});

// ──────── registerConnection / unregisterConnection ──────────────────

describe("registerConnection", () => {
  it("注册新连接到空 contest", () => {
    const ctrl = createMockController();
    registerConnection("c-1", ctrl);

    expect(contestConnections.has("c-1")).toBe(true);
    expect(contestConnections.get("c-1")!.size).toBe(1);
  });

  it("同一 contest 注册多个连接", () => {
    const ctrl1 = createMockController();
    const ctrl2 = createMockController();
    registerConnection("c-1", ctrl1);
    registerConnection("c-1", ctrl2);

    expect(contestConnections.get("c-1")!.size).toBe(2);
  });

  it("超过最大连接数时抛出异常", () => {
    // development 模式下 MAX = 1000，需要填满
    // 但测试环境下 NODE_ENV=test，走 else 分支 → MAX = 100
    for (let i = 0; i < 100; i++) {
      registerConnection("c-1", createMockController());
    }
    expect(() => registerConnection("c-1", createMockController())).toThrow(
      "Too many connections",
    );
  });
});

describe("unregisterConnection", () => {
  it("正常移除连接", () => {
    const ctrl = createMockController();
    registerConnection("c-1", ctrl);
    unregisterConnection("c-1", ctrl);

    // 空 Set 自动清理
    expect(contestConnections.has("c-1")).toBe(false);
  });

  it("移除后还有其他连接时保留 Set", () => {
    const ctrl1 = createMockController();
    const ctrl2 = createMockController();
    registerConnection("c-1", ctrl1);
    registerConnection("c-1", ctrl2);
    unregisterConnection("c-1", ctrl1);

    expect(contestConnections.get("c-1")!.size).toBe(1);
  });

  it("对不存在的 contest 调用不抛异常", () => {
    const ctrl = createMockController();
    expect(() => unregisterConnection("nonexistent", ctrl)).not.toThrow();
  });
});

// ──────── getConnectionCount ─────────────────────────────────────────

describe("getConnectionCount", () => {
  it("无连接时返回 0", () => {
    expect(getConnectionCount("c-1")).toBe(0);
  });

  it("返回正确的连接数", () => {
    registerConnection("c-1", createMockController());
    registerConnection("c-1", createMockController());
    expect(getConnectionCount("c-1")).toBe(2);
  });
});

// ──────── sendContestState ───────────────────────────────────────────

describe("sendContestState", () => {
  it("FULL 模式发送完整状态", async () => {
    const ctrl = createMockController();
    mockContestFindUnique.mockResolvedValue(mockFullContest());

    await sendContestState("c-1", ctrl, "FULL");

    expect(mockContestFindUnique).toHaveBeenCalled();
    expect(ctrl.enqueue).toHaveBeenCalledTimes(1);

    // 验证发送的数据包含 type: "state"
    const call = (ctrl.enqueue as any).mock.calls[0][0];
    const decoded = new TextDecoder().decode(call);
    const json = JSON.parse(decoded.replace("data: ", "").trim());
    expect(json.type).toBe("state");
    expect(json.contest.id).toBe("c-1");
  });

  it("OPTIMIZED 模式发送部分状态", async () => {
    const ctrl = createMockController();
    mockContestFindUnique.mockResolvedValue(mockOptimizedContest());
    mockPlayerFindMany.mockResolvedValue([]);
    mockPoolFindMany.mockResolvedValue([]);

    await sendContestState("c-1", ctrl, "OPTIMIZED");

    expect(ctrl.enqueue).toHaveBeenCalledTimes(1);
    const call = (ctrl.enqueue as any).mock.calls[0][0];
    const decoded = new TextDecoder().decode(call);
    const json = JSON.parse(decoded.replace("data: ", "").trim());
    expect(json.type).toBe("partial");
  });

  it("contest 不存在时不发送任何数据", async () => {
    const ctrl = createMockController();
    mockContestFindUnique.mockResolvedValue(null);

    await sendContestState("c-1", ctrl, "FULL");

    expect(ctrl.enqueue).not.toHaveBeenCalled();
  });

  it("controller 已关闭时静默处理", async () => {
    const ctrl = createMockController();
    mockContestFindUnique.mockResolvedValue(mockFullContest());
    (ctrl.enqueue as any).mockImplementation(() => {
      throw new Error("Controller is already closed");
    });

    // 不应抛出异常
    await expect(sendContestState("c-1", ctrl, "FULL")).resolves.toBeUndefined();
  });

  it("其他错误时打印错误日志", async () => {
    const ctrl = createMockController();
    mockContestFindUnique.mockRejectedValue(new Error("DB down"));
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await sendContestState("c-1", ctrl, "FULL");

    expect(consoleSpy).toHaveBeenCalledWith(
      "Error sending contest state:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("AUCTION BIDDING 已过期时设置 auctionExpired=true（OPTIMIZED 模式）", async () => {
    const ctrl = createMockController();
    const pastTime = new Date(Date.now() - 60000).toISOString();
    mockContestFindUnique.mockResolvedValue(
      mockOptimizedContest({
        draftMode: "AUCTION",
        auctionPhase: "BIDDING",
        bidEndTime: pastTime,
      }),
    );
    mockPlayerFindMany.mockResolvedValue([]);
    mockPoolFindMany.mockResolvedValue([]);

    await sendContestState("c-1", ctrl, "OPTIMIZED");

    const call = (ctrl.enqueue as any).mock.calls[0][0];
    const decoded = new TextDecoder().decode(call);
    const json = JSON.parse(decoded.replace("data: ", "").trim());
    expect(json.contest.auctionExpired).toBe(true);
  });

  it("AUCTION BIDDING 已过期时设置 auctionExpired=true（FULL 模式）", async () => {
    const ctrl = createMockController();
    const pastTime = new Date(Date.now() - 60000).toISOString();
    mockContestFindUnique.mockResolvedValue(
      mockFullContest({
        draftMode: "AUCTION",
        auctionPhase: "BIDDING",
        bidEndTime: pastTime,
      }),
    );

    await sendContestState("c-1", ctrl, "FULL");

    const call = (ctrl.enqueue as any).mock.calls[0][0];
    const decoded = new TextDecoder().decode(call);
    const json = JSON.parse(decoded.replace("data: ", "").trim());
    expect(json.contest.auctionExpired).toBe(true);
  });
});

// ──────── broadcastContestUpdate ─────────────────────────────────────

describe("broadcastContestUpdate", () => {
  it("无连接时直接返回，不查询 DB", async () => {
    await broadcastContestUpdate("c-1");
    expect(mockContestFindUnique).not.toHaveBeenCalled();
  });

  it("冷却期外立即广播给所有连接", async () => {
    const ctrl1 = createMockController();
    const ctrl2 = createMockController();
    registerConnection("c-1", ctrl1);
    registerConnection("c-1", ctrl2);

    mockContestFindUnique.mockResolvedValue(mockOptimizedContest());
    mockPlayerFindMany.mockResolvedValue([]);
    mockPoolFindMany.mockResolvedValue([]);

    await broadcastContestUpdate("c-1");

    expect(ctrl1.enqueue).toHaveBeenCalled();
    expect(ctrl2.enqueue).toHaveBeenCalled();
  });

  it("冷却期内延迟广播（trailing edge）", async () => {
    const ctrl = createMockController();
    registerConnection("c-1", ctrl);

    mockContestFindUnique.mockResolvedValue(mockOptimizedContest());
    mockPlayerFindMany.mockResolvedValue([]);
    mockPoolFindMany.mockResolvedValue([]);

    // 第一次广播
    await broadcastContestUpdate("c-1");
    expect(ctrl.enqueue).toHaveBeenCalledTimes(1);

    // 立即第二次广播 → 应该进入 trailing edge
    (ctrl.enqueue as any).mockClear();
    mockContestFindUnique.mockResolvedValue(
      mockOptimizedContest({ currentTurn: 1 }),
    );

    await broadcastContestUpdate("c-1");

    // 尚未发送（在冷却期内）
    expect(ctrl.enqueue).not.toHaveBeenCalled();

    // 推进时间过冷却期
    await vi.advanceTimersByTimeAsync(300);

    expect(ctrl.enqueue).toHaveBeenCalled();
  });

  it("payload 相同时跳过广播（去重）", async () => {
    const ctrl = createMockController();
    registerConnection("c-1", ctrl);

    const contest = mockOptimizedContest();
    mockContestFindUnique.mockResolvedValue(contest);
    mockPlayerFindMany.mockResolvedValue([]);
    mockPoolFindMany.mockResolvedValue([]);

    // 第一次广播
    await broadcastContestUpdate("c-1");
    expect(ctrl.enqueue).toHaveBeenCalledTimes(1);

    // 等待冷却期过
    await vi.advanceTimersByTimeAsync(300);
    (ctrl.enqueue as any).mockClear();

    // 第二次广播（相同 payload）
    await broadcastContestUpdate("c-1");

    // payload 相同 → 跳过
    expect(ctrl.enqueue).not.toHaveBeenCalled();
  });

  it("controller.enqueue 异常时不影响其他连接", async () => {
    const ctrl1 = createMockController();
    const ctrl2 = createMockController();
    registerConnection("c-1", ctrl1);
    registerConnection("c-1", ctrl2);

    (ctrl1.enqueue as any).mockImplementation(() => {
      throw new Error("closed");
    });

    mockContestFindUnique.mockResolvedValue(mockOptimizedContest());
    mockPlayerFindMany.mockResolvedValue([]);
    mockPoolFindMany.mockResolvedValue([]);

    await broadcastContestUpdate("c-1");

    // ctrl2 仍然接收到广播
    expect(ctrl2.enqueue).toHaveBeenCalled();
  });

  it("冷却期内多次调用只保留最后一次 trailing", async () => {
    const ctrl = createMockController();
    registerConnection("c-1", ctrl);

    mockContestFindUnique.mockResolvedValue(mockOptimizedContest());
    mockPlayerFindMany.mockResolvedValue([]);
    mockPoolFindMany.mockResolvedValue([]);

    // 第一次正常广播
    await broadcastContestUpdate("c-1");
    expect(ctrl.enqueue).toHaveBeenCalledTimes(1);
    (ctrl.enqueue as any).mockClear();

    // 快速连续触发两次（在冷却期内）
    mockContestFindUnique.mockResolvedValue(
      mockOptimizedContest({ currentTurn: 1 }),
    );
    await broadcastContestUpdate("c-1");
    mockContestFindUnique.mockResolvedValue(
      mockOptimizedContest({ currentTurn: 2 }),
    );
    await broadcastContestUpdate("c-1");

    // 推进时间
    await vi.advanceTimersByTimeAsync(300);

    // 只执行了一次广播（最后一次 trailing）
    expect(ctrl.enqueue).toHaveBeenCalledTimes(1);
  });
});
