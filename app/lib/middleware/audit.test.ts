/**
 * 审计日志中间件单元测试
 *
 * 通过 vi.mock 模拟 Prisma，直接调用真实导出函数
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Prisma ─────────────────────────────────────────────────────

const mockCreate = vi.fn().mockResolvedValue({});
const mockFindMany = vi.fn().mockResolvedValue([]);

vi.mock("@/app/lib/db/prisma", () => ({
  prisma: {
    auditLog: {
      create: (...args: any[]) => mockCreate(...args),
      findMany: (...args: any[]) => mockFindMany(...args),
    },
  },
}));

// ─── 导入被测模块 ────────────────────────────────────────────────────

import {
  logAudit,
  auditFromRequest,
  audit,
  getAuditLogs,
  AuditActions,
} from "./audit";

// ─── 测试 ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("logAudit", () => {
  it("正常记录审计日志", async () => {
    await logAudit({
      userId: "admin-1",
      userType: "ADMIN",
      action: "ADMIN_LOGIN",
      status: "SUCCESS",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "admin-1",
        userType: "ADMIN",
        action: "ADMIN_LOGIN",
        status: "SUCCESS",
      }),
    });
  });

  it("带完整字段记录", async () => {
    await logAudit({
      userId: "player-1",
      userType: "PLAYER",
      action: "BID",
      resource: "Contest",
      resourceId: "contest-1",
      ipAddress: "1.2.3.4",
      userAgent: "Mozilla/5.0",
      details: { amount: 50 },
      status: "SUCCESS",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resource: "Contest",
        resourceId: "contest-1",
        ipAddress: "1.2.3.4",
        details: { amount: 50 },
      }),
    });
  });

  it("Prisma 报错不抛异常（静默失败）", async () => {
    mockCreate.mockRejectedValueOnce(new Error("DB error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // 不抛异常
    await expect(
      logAudit({
        userType: "SYSTEM",
        action: "TEST",
        status: "SUCCESS",
      }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to log audit:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});

describe("auditFromRequest", () => {
  function mockRequest(headers: Record<string, string> = {}): Request {
    return {
      headers: {
        get: (name: string) => headers[name.toLowerCase()] ?? null,
      },
    } as unknown as Request;
  }

  it("从 x-forwarded-for 提取 IP", async () => {
    const req = mockRequest({
      "x-forwarded-for": "10.0.0.1, 10.0.0.2",
      "user-agent": "TestAgent",
    });

    await auditFromRequest(req, {
      userType: "ADMIN",
      action: "ADMIN_LOGIN",
      status: "SUCCESS",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ipAddress: "10.0.0.1",
        userAgent: "TestAgent",
      }),
    });
  });

  it("从 x-real-ip 提取 IP", async () => {
    const req = mockRequest({ "x-real-ip": "192.168.1.1" });

    await auditFromRequest(req, {
      userType: "PLAYER",
      action: "BID",
      status: "SUCCESS",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ipAddress: "192.168.1.1",
      }),
    });
  });

  it("无 IP 头时返回 unknown", async () => {
    const req = mockRequest({});

    await auditFromRequest(req, {
      userType: "SYSTEM",
      action: "TEST",
      status: "SUCCESS",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ipAddress: "unknown",
        userAgent: undefined,
      }),
    });
  });
});

describe("audit 快捷函数", () => {
  it("audit.success 使用 SYSTEM + SUCCESS", async () => {
    await audit.success("TEST_ACTION");
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "TEST_ACTION",
        userType: "SYSTEM",
        status: "SUCCESS",
      }),
    });
  });

  it("audit.failed 使用 FAILED", async () => {
    await audit.failed("TEST_ACTION");
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "FAILED" }),
    });
  });

  it("audit.denied 使用 DENIED", async () => {
    await audit.denied("TEST_ACTION");
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "DENIED" }),
    });
  });

  it("audit.admin 设置 ADMIN 类型和 userId", async () => {
    await audit.admin("ADMIN_LOGIN", "admin-1");
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "admin-1",
        userType: "ADMIN",
        status: "SUCCESS",
      }),
    });
  });

  it("audit.player 设置 PLAYER 类型和 userId", async () => {
    await audit.player("BID", "player-1", { resource: "Contest" });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "player-1",
        userType: "PLAYER",
        resource: "Contest",
      }),
    });
  });
});

describe("getAuditLogs", () => {
  it("无过滤条件时查询全部", async () => {
    await getAuditLogs({});
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { timestamp: "desc" },
      take: 100,
    });
  });

  it("按多条件过滤", async () => {
    await getAuditLogs({
      userId: "admin-1",
      action: "ADMIN_LOGIN",
      status: "SUCCESS",
      limit: 50,
    });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        userId: "admin-1",
        action: "ADMIN_LOGIN",
        status: "SUCCESS",
      },
      orderBy: { timestamp: "desc" },
      take: 50,
    });
  });

  it("按时间范围过滤", async () => {
    const start = new Date("2026-01-01");
    const end = new Date("2026-02-01");

    await getAuditLogs({ startDate: start, endDate: end });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        timestamp: { gte: start, lte: end },
      },
      orderBy: { timestamp: "desc" },
      take: 100,
    });
  });

  it("仅 startDate 过滤", async () => {
    const start = new Date("2026-01-01");
    await getAuditLogs({ startDate: start });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        timestamp: { gte: start },
      },
      orderBy: { timestamp: "desc" },
      take: 100,
    });
  });

  it("按 resource 和 resourceId 过滤", async () => {
    await getAuditLogs({ resource: "Contest", resourceId: "c-1" });
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { resource: "Contest", resourceId: "c-1" },
      orderBy: { timestamp: "desc" },
      take: 100,
    });
  });
});

describe("AuditActions 常量", () => {
  it("包含核心操作类型", () => {
    expect(AuditActions.ADMIN_LOGIN).toBe("ADMIN_LOGIN");
    expect(AuditActions.BID).toBe("BID");
    expect(AuditActions.DRAFT_PICK).toBe("DRAFT_PICK");
    expect(AuditActions.DELETE_PLAYER).toBe("DELETE_PLAYER");
  });
});
