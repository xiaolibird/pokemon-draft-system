import { describe, it, expect } from "vitest";
import {
  generateSignature,
  verifySignature,
  createSignedRequest,
  getCurrentTimestamp,
} from "./signature";

describe("签名验证中间件", () => {
  const testSecret = "test-secret-key-12345";

  describe("generateSignature", () => {
    it("应该生成一致的签名", () => {
      const body = '{"amount":100}';
      const timestamp = "1700000000000";

      const sig1 = generateSignature(body, timestamp, testSecret);
      const sig2 = generateSignature(body, timestamp, testSecret);

      expect(sig1).toBe(sig2);
    });

    it("应该对不同的 body 生成不同的签名", () => {
      const timestamp = "1700000000000";

      const sig1 = generateSignature('{"amount":100}', timestamp, testSecret);
      const sig2 = generateSignature('{"amount":200}', timestamp, testSecret);

      expect(sig1).not.toBe(sig2);
    });

    it("应该对不同的 timestamp 生成不同的签名", () => {
      const body = '{"amount":100}';

      const sig1 = generateSignature(body, "1700000000000", testSecret);
      const sig2 = generateSignature(body, "1700000000001", testSecret);

      expect(sig1).not.toBe(sig2);
    });

    it("应该对不同的 secret 生成不同的签名", () => {
      const body = '{"amount":100}';
      const timestamp = "1700000000000";

      const sig1 = generateSignature(body, timestamp, "secret-1");
      const sig2 = generateSignature(body, timestamp, "secret-2");

      expect(sig1).not.toBe(sig2);
    });

    it("应该生成 hex 格式的签名", () => {
      const sig = generateSignature("body", "12345", testSecret);
      expect(sig).toMatch(/^[0-9a-f]+$/);
    });

    it("应该生成 64 字符的 SHA256 签名", () => {
      const sig = generateSignature("body", "12345", testSecret);
      expect(sig).toHaveLength(64);
    });
  });

  describe("verifySignature", () => {
    it("应该验证有效的签名", async () => {
      const body = '{"amount":100}';
      const timestamp = Date.now().toString();
      const signature = generateSignature(body, timestamp, testSecret);

      const request = new Request("http://localhost/api/test", {
        method: "POST",
        headers: {
          "X-Signature": signature,
          "X-Timestamp": timestamp,
        },
        body,
      });

      const result = await verifySignature(request, testSecret);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("应该拒绝缺少签名头的请求", async () => {
      const request = new Request("http://localhost/api/test", {
        method: "POST",
        body: '{"amount":100}',
      });

      const result = await verifySignature(request, testSecret);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing signature or timestamp");
    });

    it("应该拒绝只有 signature 没有 timestamp 的请求", async () => {
      const request = new Request("http://localhost/api/test", {
        method: "POST",
        headers: { "X-Signature": "abc123" },
        body: "test",
      });

      const result = await verifySignature(request, testSecret);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing signature or timestamp");
    });

    it("应该拒绝过期的时间戳（防重放攻击）", async () => {
      const body = '{"amount":100}';
      // 6 分钟前的时间戳，超过 5 分钟窗口
      const expiredTimestamp = (Date.now() - 6 * 60 * 1000).toString();
      const signature = generateSignature(body, expiredTimestamp, testSecret);

      const request = new Request("http://localhost/api/test", {
        method: "POST",
        headers: {
          "X-Signature": signature,
          "X-Timestamp": expiredTimestamp,
        },
        body,
      });

      const result = await verifySignature(request, testSecret);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("expired");
    });

    it("应该接受 5 分钟窗口内的时间戳", async () => {
      const body = '{"amount":100}';
      // 4 分钟前的时间戳，在 5 分钟窗口内
      const recentTimestamp = (Date.now() - 4 * 60 * 1000).toString();
      const signature = generateSignature(body, recentTimestamp, testSecret);

      const request = new Request("http://localhost/api/test", {
        method: "POST",
        headers: {
          "X-Signature": signature,
          "X-Timestamp": recentTimestamp,
        },
        body,
      });

      const result = await verifySignature(request, testSecret);
      expect(result.valid).toBe(true);
    });

    it("应该拒绝错误的签名（body 被篡改）", async () => {
      const timestamp = Date.now().toString();
      // 用原始 body 签名
      const signature = generateSignature(
        '{"amount":100}',
        timestamp,
        testSecret,
      );

      // 但实际发送的 body 不同
      const request = new Request("http://localhost/api/test", {
        method: "POST",
        headers: {
          "X-Signature": signature,
          "X-Timestamp": timestamp,
        },
        body: '{"amount":999}',
      });

      const result = await verifySignature(request, testSecret);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid signature");
    });

    it("应该拒绝用错误 secret 生成的签名", async () => {
      const body = '{"amount":100}';
      const timestamp = Date.now().toString();
      const signature = generateSignature(body, timestamp, "wrong-secret");

      const request = new Request("http://localhost/api/test", {
        method: "POST",
        headers: {
          "X-Signature": signature,
          "X-Timestamp": timestamp,
        },
        body,
      });

      const result = await verifySignature(request, testSecret);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid signature");
    });

    it("应该与 createSignedRequest 端到端配合", async () => {
      const data = { amount: 100, action: "bid" };
      const signed = createSignedRequest(data, testSecret);

      const request = new Request("http://localhost/api/test", {
        method: "POST",
        headers: {
          "X-Signature": signed.signature,
          "X-Timestamp": signed.timestamp,
        },
        body: signed.body,
      });

      const result = await verifySignature(request, testSecret);
      expect(result.valid).toBe(true);
    });
  });

  describe("createSignedRequest", () => {
    it("应该返回包含 body、timestamp 和 signature 的对象", () => {
      const result = createSignedRequest({ amount: 100 }, testSecret);

      expect(result.body).toBe('{"amount":100}');
      expect(result.timestamp).toBeDefined();
      expect(result.signature).toBeDefined();
    });

    it("应该生成与 generateSignature 一致的签名", () => {
      const result = createSignedRequest({ amount: 100 }, testSecret);
      const expectedSig = generateSignature(
        result.body,
        result.timestamp,
        testSecret,
      );

      expect(result.signature).toBe(expectedSig);
    });

    it("应该正确序列化 body", () => {
      const data = { name: "test", value: 42, nested: { key: "val" } };
      const result = createSignedRequest(data, testSecret);

      expect(JSON.parse(result.body)).toEqual(data);
    });

    it("应该使用当前时间戳", () => {
      const before = Date.now();
      const result = createSignedRequest({}, testSecret);
      const after = Date.now();

      const ts = parseInt(result.timestamp);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });

  describe("getCurrentTimestamp", () => {
    it("应该返回字符串格式的时间戳", () => {
      const ts = getCurrentTimestamp();
      expect(typeof ts).toBe("string");
    });

    it("应该返回可解析的毫秒时间戳", () => {
      const ts = getCurrentTimestamp();
      const parsed = parseInt(ts);
      expect(isNaN(parsed)).toBe(false);
      expect(parsed).toBeGreaterThan(1700000000000);
    });

    it("应该返回当前时间附近的值", () => {
      const before = Date.now();
      const ts = parseInt(getCurrentTimestamp());
      const after = Date.now();

      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });
});
