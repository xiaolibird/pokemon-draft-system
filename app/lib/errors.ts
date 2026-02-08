import { NextResponse } from "next/server";

/**
 * 统一错误响应格式
 */

export interface APIErrorResponse {
  error: string; // 用户友好的错误信息
  code: string; // 错误码 (如 DP_VALIDATION_FAILED)
  reason?: string; // 技术原因
  suggestion?: string; // 给用户的建议
  timestamp: string;
}

/**
 * 基础错误类
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public reason?: string,
    public suggestion?: string,
    public status: number = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * 创建API错误响应
 */
export function apiError(
  message: string,
  code: string,
  options?: {
    reason?: string;
    suggestion?: string;
    status?: number;
  },
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      code,
      reason: options?.reason,
      suggestion: options?.suggestion,
      timestamp: new Date().toISOString(),
    },
    { status: options?.status ?? 400 },
  );
}

/**
 * 创建成功响应
 */
export function apiSuccess<T>(
  data: T,
  options?: { status?: number },
): NextResponse {
  return NextResponse.json(data, { status: options?.status ?? 200 });
}
