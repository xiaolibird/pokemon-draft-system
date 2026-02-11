import { describe, it, expect, vi, beforeEach } from "vitest";
import { signToken, verifyToken } from "./jwt";

describe("JWT 认证", () => {
  beforeEach(() => {
    // 设置测试用 JWT_SECRET
    vi.stubEnv("JWT_SECRET", "test-jwt-secret-for-unit-tests");
  });

  describe("signToken", () => {
    it("应该生成有效的 JWT token", async () => {
      const token = await signToken({ userId: "user-1", role: "admin" });
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3); // JWT 有 3 部分
    });

    it("应该为不同 payload 生成不同 token", async () => {
      const token1 = await signToken({ userId: "user-1" });
      const token2 = await signToken({ userId: "user-2" });
      expect(token1).not.toBe(token2);
    });
  });

  describe("verifyToken", () => {
    it("应该验证有效的 token 并返回 payload", async () => {
      const payload = { userId: "user-1", role: "admin" };
      const token = await signToken(payload);
      const result = await verifyToken(token);

      expect(result).toBeDefined();
      expect(result!.userId).toBe("user-1");
      expect(result!.role).toBe("admin");
    });

    it("应该在 token 无效时返回 null", async () => {
      const result = await verifyToken("invalid-token");
      expect(result).toBeNull();
    });

    it("应该在 token 被篡改时返回 null", async () => {
      const token = await signToken({ userId: "user-1" });
      const tampered = token.slice(0, -5) + "XXXXX";
      const result = await verifyToken(tampered);
      expect(result).toBeNull();
    });

    it("应该包含 iat 和 exp 字段", async () => {
      const token = await signToken({ userId: "user-1" });
      const result = await verifyToken(token);

      expect(result).toBeDefined();
      expect(result!.iat).toBeDefined();
      expect(result!.exp).toBeDefined();
    });

    it("应该设置 24 小时过期", async () => {
      const token = await signToken({ userId: "user-1" });
      const result = await verifyToken(token);

      const iat = result!.iat as number;
      const exp = result!.exp as number;
      // 24h = 86400s
      expect(exp - iat).toBe(86400);
    });
  });

  describe("环境变量处理", () => {
    it("应该在开发环境没有 JWT_SECRET 时使用默认密钥", async () => {
      vi.stubEnv("JWT_SECRET", "");
      vi.stubEnv("NODE_ENV", "development");

      const token = await signToken({ test: true });
      expect(typeof token).toBe("string");
    });
  });
});
