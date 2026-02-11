/**
 * useDraftActions Hook 单元测试
 *
 * 测试出价/选择/结算操作的防抖、错误处理、状态管理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ─── Mock apiFetch ───────────────────────────────────────────────────

const mockApiFetch = vi.fn();

vi.mock("../api/fetch", () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
}));

// ─── 导入被测模块 ────────────────────────────────────────────────────

import { useDraftActions } from "./useDraftActions";

// ─── 辅助函数 ────────────────────────────────────────────────────────

function createProps(overrides: Record<string, any> = {}) {
  return {
    contestId: "c-1",
    playerId: "p-1",
    draftMode: "SNAKE" as string,
    showToast: vi.fn(),
    revalidate: vi.fn(),
    ...overrides,
  };
}

function mockOkResponse(json: any = {}) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(JSON.stringify(json)),
  };
}

function mockErrorResponse(status: number, json: any = {}) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(JSON.stringify(json)),
  };
}

// ─── 测试 ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDraftActions", () => {
  describe("初始状态", () => {
    it("返回正确的初始值", () => {
      const { result } = renderHook(() => useDraftActions(createProps()));

      expect(result.current.finalizing).toBe(false);
      expect(result.current.actionSubmitting).toBe(false);
      expect(result.current.bidSubmitting).toBe(false);
      expect(result.current.optimisticPendingPoolId).toBeNull();
    });
  });

  describe("submitDraftAction", () => {
    it("SNAKE 模式调用 draft-pick 接口", async () => {
      mockApiFetch.mockResolvedValue(mockOkResponse());
      const props = createProps({ draftMode: "SNAKE" });
      const { result } = renderHook(() => useDraftActions(props));

      await act(async () => {
        await result.current.submitDraftAction("pool-1");
      });

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/player/draft-pick",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ pokemonPoolId: "pool-1" }),
        }),
      );
      expect(props.revalidate).toHaveBeenCalled();
    });

    it("AUCTION 模式调用 nominate 接口", async () => {
      mockApiFetch.mockResolvedValue(mockOkResponse());
      const props = createProps({ draftMode: "AUCTION" });
      const { result } = renderHook(() => useDraftActions(props));

      await act(async () => {
        await result.current.submitDraftAction("pool-1");
      });

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/player/nominate",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("API 失败时显示错误 toast", async () => {
      mockApiFetch.mockResolvedValue(
        mockErrorResponse(400, { error: "不是你的回合" }),
      );
      const props = createProps();
      const { result } = renderHook(() => useDraftActions(props));

      await act(async () => {
        await result.current.submitDraftAction("pool-1");
      });

      expect(props.showToast).toHaveBeenCalledWith({
        type: "error",
        message: "不是你的回合",
        suggestion: undefined,
      });
    });

    it("网络错误时显示网络错误 toast", async () => {
      mockApiFetch.mockRejectedValue(new Error("Network error"));
      const props = createProps();
      const { result } = renderHook(() => useDraftActions(props));

      await act(async () => {
        await result.current.submitDraftAction("pool-1");
      });

      expect(props.showToast).toHaveBeenCalledWith({
        type: "error",
        message: "网络错误",
      });
    });

    it("防抖：500ms 内重复调用被忽略", async () => {
      mockApiFetch.mockResolvedValue(mockOkResponse());
      const props = createProps();
      const { result } = renderHook(() => useDraftActions(props));

      await act(async () => {
        await result.current.submitDraftAction("pool-1");
      });

      // 立即再次调用（在 500ms 内）
      await act(async () => {
        await result.current.submitDraftAction("pool-2");
      });

      // 只调用了一次
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("placeBid", () => {
    it("成功出价后调用 revalidate", async () => {
      mockApiFetch.mockResolvedValue(mockOkResponse());
      const props = createProps();
      const { result } = renderHook(() => useDraftActions(props));

      await act(async () => {
        await result.current.placeBid(50);
      });

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/player/bid",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ amount: 50 }),
        }),
      );
      expect(props.revalidate).toHaveBeenCalled();
    });

    it("RACE_CONDITION 错误触发 revalidate 和特殊 toast", async () => {
      mockApiFetch.mockResolvedValue(
        mockErrorResponse(409, { code: "RACE_CONDITION", suggestion: "重试" }),
      );
      const props = createProps();
      const { result } = renderHook(() => useDraftActions(props));

      await act(async () => {
        await result.current.placeBid(50);
      });

      expect(props.revalidate).toHaveBeenCalled();
      expect(props.showToast).toHaveBeenCalledWith({
        type: "error",
        message: "价格已过时，请重试",
        suggestion: "重试",
      });
    });

    it("BID_TOO_LOW 错误触发 revalidate 和特殊 toast", async () => {
      mockApiFetch.mockResolvedValue(
        mockErrorResponse(400, { code: "BID_TOO_LOW" }),
      );
      const props = createProps();
      const { result } = renderHook(() => useDraftActions(props));

      await act(async () => {
        await result.current.placeBid(50);
      });

      expect(props.revalidate).toHaveBeenCalled();
      expect(props.showToast).toHaveBeenCalledWith({
        type: "error",
        message: "价格已过时，请重试",
        suggestion: "最新价格已更新",
      });
    });

    it("普通出价错误显示 error toast", async () => {
      mockApiFetch.mockResolvedValue(
        mockErrorResponse(400, { error: "代币不足" }),
      );
      const props = createProps();
      const { result } = renderHook(() => useDraftActions(props));

      await act(async () => {
        await result.current.placeBid(50);
      });

      expect(props.showToast).toHaveBeenCalledWith({
        type: "error",
        message: "代币不足",
        suggestion: undefined,
      });
    });

    it("网络错误显示 toast", async () => {
      mockApiFetch.mockRejectedValue(new Error("timeout"));
      const props = createProps();
      const { result } = renderHook(() => useDraftActions(props));

      await act(async () => {
        await result.current.placeBid(50);
      });

      expect(props.showToast).toHaveBeenCalledWith({
        type: "error",
        message: "网络错误",
      });
    });

    it("防抖：500ms 内重复调用被忽略", async () => {
      mockApiFetch.mockResolvedValue(mockOkResponse());
      const props = createProps();
      const { result } = renderHook(() => useDraftActions(props));

      await act(async () => {
        await result.current.placeBid(50);
      });

      await act(async () => {
        await result.current.placeBid(60);
      });

      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("finalizeAuction", () => {
    it("成功结算后调用 revalidate", async () => {
      mockApiFetch.mockResolvedValue(mockOkResponse());
      const props = createProps();
      const { result } = renderHook(() => useDraftActions(props));

      await act(async () => {
        await result.current.finalizeAuction();
      });

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/player/auction/finalize",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ contestId: "c-1" }),
        }),
      );
      expect(props.revalidate).toHaveBeenCalled();
    });

    it("防止重复结算（finalizingRef 保护）", async () => {
      mockApiFetch.mockResolvedValue(mockOkResponse());
      const props = createProps();
      const { result } = renderHook(() => useDraftActions(props));

      // 同时调用两次
      await act(async () => {
        result.current.finalizeAuction();
        result.current.finalizeAuction();
      });

      // 只调用了一次
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });

    it("结算失败后打印错误日志", async () => {
      mockApiFetch.mockRejectedValue(new Error("Server error"));
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const props = createProps();
      const { result } = renderHook(() => useDraftActions(props));

      await act(async () => {
        await result.current.finalizeAuction();
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "Finalize failed",
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });

    it("5 秒后重置 finalizing 状态", async () => {
      mockApiFetch.mockResolvedValue(mockOkResponse());
      const props = createProps();
      const { result } = renderHook(() => useDraftActions(props));

      await act(async () => {
        await result.current.finalizeAuction();
      });

      // finally 中设置了 5s 延迟重置
      expect(result.current.finalizing).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.finalizing).toBe(false);
    });
  });
});
