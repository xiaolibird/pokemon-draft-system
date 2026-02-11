import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkRateLimit,
  getRateLimitHeaders,
  RateLimitConfig,
} from "./rate-limit";

// 创建一个 mock Request
function createRequest(
  url: string = "http://localhost:3000/api/test",
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    headers: new Headers(headers),
  });
}

describe("Rate Limit 中间件", () => {
  describe("checkRateLimit", () => {
    it("应该在限制内允许请求", () => {
      const config: RateLimitConfig = {
        maxRequests: 10,
        windowMs: 60000,
        // 用唯一的 keyGenerator 避免跨测试污染
        keyGenerator: () => `test-allow-${Date.now()}-${Math.random()}`,
      };
      const req = createRequest();
      const result = checkRateLimit(req, config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.limit).toBe(10);
    });

    it("应该在超过限制时拒绝请求", () => {
      const uniqueKey = `test-reject-${Date.now()}-${Math.random()}`;
      const config: RateLimitConfig = {
        maxRequests: 2,
        windowMs: 60000,
        keyGenerator: () => uniqueKey,
      };
      const req = createRequest();

      checkRateLimit(req, config); // 1
      checkRateLimit(req, config); // 2
      const result = checkRateLimit(req, config); // 3 - 超限

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("应该正确计算 remaining", () => {
      const uniqueKey = `test-remaining-${Date.now()}-${Math.random()}`;
      const config: RateLimitConfig = {
        maxRequests: 5,
        windowMs: 60000,
        keyGenerator: () => uniqueKey,
      };
      const req = createRequest();

      const r1 = checkRateLimit(req, config);
      expect(r1.remaining).toBe(4);

      const r2 = checkRateLimit(req, config);
      expect(r2.remaining).toBe(3);
    });

    it("应该在 skip 返回 true 时跳过限制", () => {
      const config: RateLimitConfig = {
        maxRequests: 1,
        windowMs: 60000,
        skip: () => true,
      };
      const req = createRequest();

      const r1 = checkRateLimit(req, config);
      const r2 = checkRateLimit(req, config);
      const r3 = checkRateLimit(req, config);

      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(true);
    });

    it("应该使用自定义 keyGenerator", () => {
      const key1 = `custom-key-1-${Date.now()}`;
      const key2 = `custom-key-2-${Date.now()}`;

      const config1: RateLimitConfig = {
        maxRequests: 1,
        windowMs: 60000,
        keyGenerator: () => key1,
      };
      const config2: RateLimitConfig = {
        maxRequests: 1,
        windowMs: 60000,
        keyGenerator: () => key2,
      };
      const req = createRequest();

      checkRateLimit(req, config1); // key1: 1/1
      const r1 = checkRateLimit(req, config1); // key1: 2/1 - 超限
      const r2 = checkRateLimit(req, config2); // key2: 1/1 - 新 key

      expect(r1.allowed).toBe(false);
      expect(r2.allowed).toBe(true);
    });

    it("应该从 x-forwarded-for 获取 IP", () => {
      const uniqueIp = `192.168.1.${Math.floor(Math.random() * 255)}`;
      const config: RateLimitConfig = {
        maxRequests: 1,
        windowMs: 60000,
      };
      const req = createRequest("http://localhost:3000/api/test", {
        "x-forwarded-for": `${uniqueIp}, 10.0.0.1`,
      });

      const result = checkRateLimit(req, config);
      expect(result.allowed).toBe(true);
    });

    it("应该从 x-real-ip 获取 IP", () => {
      const config: RateLimitConfig = {
        maxRequests: 1,
        windowMs: 60000,
      };
      const uniqueIp = `10.0.0.${Math.floor(Math.random() * 255)}`;
      const req = createRequest("http://localhost:3000/api/test", {
        "x-real-ip": uniqueIp,
      });

      const result = checkRateLimit(req, config);
      expect(result.allowed).toBe(true);
    });

    it("应该返回正确的 resetTime", () => {
      const now = Date.now();
      const config: RateLimitConfig = {
        maxRequests: 10,
        windowMs: 60000,
        keyGenerator: () => `test-reset-${now}-${Math.random()}`,
      };
      const req = createRequest();

      const result = checkRateLimit(req, config);
      // resetTime 应该在 now + windowMs 附近
      expect(result.resetTime).toBeGreaterThanOrEqual(now);
      expect(result.resetTime).toBeLessThanOrEqual(now + 60000 + 100);
    });
  });

  describe("getRateLimitHeaders", () => {
    it("应该返回正确的响应头", () => {
      const result = {
        allowed: true,
        remaining: 5,
        resetTime: Date.now() + 30000,
        limit: 10,
      };

      const headers = getRateLimitHeaders(result);

      expect(headers["X-RateLimit-Limit"]).toBe("10");
      expect(headers["X-RateLimit-Remaining"]).toBe("5");
      expect(headers["X-RateLimit-Reset"]).toBeDefined();
    });

    it("应该在 remaining 为 0 时返回正确头", () => {
      const result = {
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 60000,
        limit: 100,
      };

      const headers = getRateLimitHeaders(result);
      expect(headers["X-RateLimit-Remaining"]).toBe("0");
    });
  });
});
