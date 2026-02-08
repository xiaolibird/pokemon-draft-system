/**
 * 请求签名验证工具
 * 用于防止请求篡改和重放攻击
 */

import crypto from "crypto";

/**
 * 验证请求签名（防止请求篡改）
 * 用于敏感操作（出价、选秀等）
 */
export async function verifySignature(
  request: Request,
  secret: string,
): Promise<{ valid: boolean; error?: string }> {
  const signature = request.headers.get("X-Signature");
  const timestamp = request.headers.get("X-Timestamp");

  if (!signature || !timestamp) {
    return { valid: false, error: "Missing signature or timestamp headers" };
  }

  // 验证请求时间戳（防止重放攻击）
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();
  const timeDiff = Math.abs(now - requestTime);

  // 5分钟过期
  if (timeDiff > 5 * 60 * 1000) {
    return { valid: false, error: "Request timestamp expired" };
  }

  const body = await request.text();

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}:${body}`)
    .digest("hex");

  if (signature !== expectedSignature) {
    return { valid: false, error: "Invalid signature" };
  }

  return { valid: true };
}

/**
 * 生成请求签名
 */
export function generateSignature(
  body: string,
  timestamp: string,
  secret: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}:${body}`)
    .digest("hex");
}

/**
 * 创建带签名的请求选项
 */
export function createSignedRequest(
  bodyData: object,
  secret: string,
): { body: string; timestamp: string; signature: string } {
  const timestamp = Date.now().toString();
  const bodyStr = JSON.stringify(bodyData);
  const signature = generateSignature(bodyStr, timestamp, secret);

  return {
    body: bodyStr,
    timestamp,
    signature,
  };
}

/**
 * 获取当前时间戳（毫秒）
 */
export function getCurrentTimestamp(): string {
  return Date.now().toString();
}
