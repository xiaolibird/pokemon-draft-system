/**
 * useContestStream Hook 单元测试
 *
 * 测试 SSE 连接、轮询回退、数据合并、连接质量监控
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ─── Mock apiFetch ───────────────────────────────────────────────────

const mockApiFetch = vi.fn();

vi.mock("../api/fetch", () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
}));

// ─── Mock logger-client ──────────────────────────────────────────────

vi.mock("../logger-client", () => ({
  logDebug: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

// ─── Mock EventSource ────────────────────────────────────────────────

class MockEventSource {
  url: string;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  readyState = 0;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    // 自动触发 open（模拟浏览器行为）
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.(new Event("open"));
    });
  }

  // 测试辅助：触发消息
  _simulateMessage(data: any) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  // 测试辅助：触发错误
  _simulateError() {
    this.onerror?.(new Event("error"));
  }
}

let lastEventSource: MockEventSource | null = null;

// ─── 导入被测模块 ────────────────────────────────────────────────────

import { isSSESupported, useContestStream } from "./useContestStream";

// ─── 辅助函数 ────────────────────────────────────────────────────────

function mockFetchOk(contestData: any = {}) {
  const base = {
    id: "c-1",
    status: "ACTIVE",
    players: [{ id: "p-1", username: "Player 1" }],
    pokemonPool: [{ id: "pool-1", status: "AVAILABLE" }],
    timestamp: Date.now(),
    ...contestData,
  };
  mockApiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(base),
  });
  return base;
}

function mockFetchError(status = 500) {
  mockApiFetch.mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  });
}

// ─── 测试 ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  lastEventSource = null;

  // 注册全局 EventSource mock
  (globalThis as any).EventSource = function (url: string) {
    const es = new MockEventSource(url);
    lastEventSource = es;
    return es;
  };
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as any).EventSource;
});

describe("isSSESupported", () => {
  it("EventSource 可用时返回 true", () => {
    expect(isSSESupported()).toBe(true);
  });

  it("EventSource 不可用时返回 false", () => {
    const saved = (globalThis as any).EventSource;
    delete (globalThis as any).EventSource;
    expect(isSSESupported()).toBe(false);
    (globalThis as any).EventSource = saved;
  });
});

describe("useContestStream", () => {
  describe("初始化", () => {
    it("enabled=true 时进行初始 fetch", async () => {
      mockFetchOk();
      renderHook(() =>
        useContestStream({ contestId: "c-1", enabled: true }),
      );

      // 初始 fetchData 调用
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/admin/contests/c-1",
        expect.objectContaining({
          headers: { "Cache-Control": "no-cache" },
        }),
      );
    });

    it("enabled=false 时不 fetch，状态为 disconnected", async () => {
      const { result } = renderHook(() =>
        useContestStream({ contestId: "c-1", enabled: false }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.status).toBe("disconnected");
      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it("初始 fetch 成功后设置 data", async () => {
      const contestData = mockFetchOk({
        players: [{ id: "p-1", username: "Alice" }],
      });

      const { result } = renderHook(() =>
        useContestStream({ contestId: "c-1" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.data).not.toBeNull();
      expect(result.current.data!.contest.id).toBe("c-1");
      expect(result.current.data!.players).toHaveLength(1);
    });
  });

  describe("SSE 连接", () => {
    it("SSE 连接成功后状态变为 connected", async () => {
      mockFetchOk();
      const { result } = renderHook(() =>
        useContestStream({ contestId: "c-1" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.status).toBe("connected");
      expect(lastEventSource).not.toBeNull();
      expect(lastEventSource!.url).toBe("/api/contests/c-1/stream");
    });

    it("接收 full state 消息更新 data", async () => {
      mockFetchOk();
      const { result } = renderHook(() =>
        useContestStream({ contestId: "c-1" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // 模拟 SSE 全量消息
      await act(async () => {
        lastEventSource!._simulateMessage({
          type: "state",
          contest: {
            id: "c-1",
            status: "ACTIVE",
            players: [{ id: "p-2", username: "Bob" }],
            pokemonPool: [],
          },
          timestamp: Date.now() + 1000,
        });
      });

      expect(result.current.data!.contest.status).toBe("ACTIVE");
    });

    it("接收 partial 消息合并到已有数据", async () => {
      mockFetchOk({
        highestBid: 10,
        players: [{ id: "p-1", username: "Alice" }],
        pokemonPool: [{ id: "pool-1", status: "AVAILABLE", pokemon: { name: "Pikachu" } }],
      });

      const { result } = renderHook(() =>
        useContestStream({ contestId: "c-1" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // 模拟 partial 更新
      await act(async () => {
        lastEventSource!._simulateMessage({
          type: "partial",
          contest: { highestBid: 50 },
          pokemonPool: [{ id: "pool-1", status: "NOMINATED" }],
          timestamp: Date.now() + 2000,
        });
      });

      // contest 合并
      expect(result.current.data!.contest.highestBid).toBe(50);
      // pokemonPool 合并保留静态数据
      const pool = result.current.data!.pokemonPool;
      expect(pool[0].status).toBe("NOMINATED");
      expect((pool[0] as any).pokemon?.name).toBe("Pikachu");
    });

    it("忽略 stale 数据（timestamp 更旧）", async () => {
      const now = Date.now();
      mockFetchOk({ timestamp: now + 5000, highestBid: 100 });

      const { result } = renderHook(() =>
        useContestStream({ contestId: "c-1" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // 发送一个更旧的 timestamp 消息
      await act(async () => {
        lastEventSource!._simulateMessage({
          type: "state",
          contest: { id: "c-1", highestBid: 50, players: [], pokemonPool: [] },
          timestamp: now + 1000, // 比 fetch 的 timestamp 更旧
        });
      });

      // 数据不应更新（保持 fetch 的数据）
      expect(result.current.data!.contest.highestBid).toBe(100);
    });
  });

  describe("轮询回退", () => {
    it("EventSource 不可用时回退到轮询", async () => {
      delete (globalThis as any).EventSource;
      mockFetchOk();

      const { result } = renderHook(() =>
        useContestStream({ contestId: "c-1" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.status).toBe("polling");
    });
  });

  describe("错误处理", () => {
    it("fetch 失败时设置 error 和触发 onError", async () => {
      // 禁用 SSE，避免 SSE onopen 重置 error 状态
      delete (globalThis as any).EventSource;
      mockApiFetch.mockRejectedValue(new Error("Network error"));
      const onError = vi.fn();

      const { result } = renderHook(() =>
        useContestStream({ contestId: "c-1", onError }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.error).not.toBeNull();
      expect(onError).toHaveBeenCalled();
    });

    it("连续错误后 connectionQuality 降级", async () => {
      // 禁用 SSE，纯测试 fetch 路径
      delete (globalThis as any).EventSource;
      mockApiFetch.mockRejectedValue(new Error("fail"));

      const { result } = renderHook(() =>
        useContestStream({ contestId: "c-1" }),
      );

      // 第一次 fetch 失败
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.connectionQuality).toBe("poor");

      // 手动触发 refetch（第二次错误）
      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.connectionQuality).toBe("disconnected");
    });
  });

  describe("比赛完成后清理", () => {
    it("contest status=COMPLETED 时断开连接", async () => {
      mockFetchOk({ status: "COMPLETED" });

      const { result } = renderHook(() =>
        useContestStream({ contestId: "c-1" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.status).toBe("disconnected");
    });
  });

  describe("onUpdate 回调", () => {
    it("数据更新时触发 onUpdate", async () => {
      mockFetchOk();
      const onUpdate = vi.fn();

      renderHook(() =>
        useContestStream({ contestId: "c-1", onUpdate }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          contest: expect.objectContaining({ id: "c-1" }),
        }),
      );
    });
  });

  describe("卸载清理", () => {
    it("卸载时关闭 EventSource", async () => {
      mockFetchOk();
      const { unmount } = renderHook(() =>
        useContestStream({ contestId: "c-1" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const es = lastEventSource!;
      unmount();

      expect(es.close).toHaveBeenCalled();
    });
  });
});
