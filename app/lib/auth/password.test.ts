import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("密码哈希", () => {
  describe("hashPassword", () => {
    it("应该生成哈希值", async () => {
      const hash = await hashPassword("test-password");
      expect(typeof hash).toBe("string");
      expect(hash).not.toBe("test-password");
    });

    it("应该生成 bcrypt 格式的哈希", async () => {
      const hash = await hashPassword("test-password");
      // bcrypt 哈希以 $2a$ 或 $2b$ 开头
      expect(hash).toMatch(/^\$2[ab]\$/);
    });

    it("应该为相同密码生成不同的哈希（盐值不同）", async () => {
      const hash1 = await hashPassword("same-password");
      const hash2 = await hashPassword("same-password");
      expect(hash1).not.toBe(hash2);
    });

    it("应该处理空密码", async () => {
      const hash = await hashPassword("");
      expect(typeof hash).toBe("string");
    });

    it("应该处理特殊字符", async () => {
      const hash = await hashPassword("p@$$w0rd!#%^&*()");
      expect(typeof hash).toBe("string");
    });

    it("应该处理长密码", async () => {
      const longPassword = "a".repeat(100);
      const hash = await hashPassword(longPassword);
      expect(typeof hash).toBe("string");
    });
  });

  describe("verifyPassword", () => {
    it("应该验证正确的密码", async () => {
      const password = "correct-password";
      const hash = await hashPassword(password);
      const result = await verifyPassword(password, hash);
      expect(result).toBe(true);
    });

    it("应该拒绝错误的密码", async () => {
      const hash = await hashPassword("correct-password");
      const result = await verifyPassword("wrong-password", hash);
      expect(result).toBe(false);
    });

    it("应该区分大小写", async () => {
      const hash = await hashPassword("Password");
      const result = await verifyPassword("password", hash);
      expect(result).toBe(false);
    });

    it("应该验证含特殊字符的密码", async () => {
      const password = "p@$$w0rd!#%^&*()";
      const hash = await hashPassword(password);
      const result = await verifyPassword(password, hash);
      expect(result).toBe(true);
    });

    it("应该验证空密码", async () => {
      const hash = await hashPassword("");
      const result = await verifyPassword("", hash);
      expect(result).toBe(true);
    });
  });
});
