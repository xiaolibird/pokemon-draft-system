/**
 * API 辅助函数
 * 用于统一处理 Rate Limiting、错误处理等
 */

import { NextResponse } from 'next/server'
import {
  checkRateLimit,
  getRateLimitHeaders,
  RateLimitConfig,
} from '../middleware/rate-limit'

export interface APIHandlerOptions {
  rateLimit?: RateLimitConfig
  requireAuth?: boolean
}

/**
 * 包装 API Handler，自动应用 Rate Limiting 和错误处理
 */
export function withAPIProtection(
  handler: (request: Request, context: any) => Promise<Response>,
  options: APIHandlerOptions = {},
) {
  return async (request: Request, context: any) => {
    try {
      // Rate Limiting
      if (options.rateLimit) {
        const result = checkRateLimit(request, options.rateLimit)
        const rateLimitHeaders = getRateLimitHeaders(result)

        if (!result.allowed) {
          return NextResponse.json(
            {
              error: '请求过于频繁，请稍后再试',
              retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
            },
            {
              status: 429,
              headers: {
                'Retry-After': Math.ceil(
                  (result.resetTime - Date.now()) / 1000,
                ).toString(),
                ...rateLimitHeaders,
              },
            },
          )
        }

        // 继续处理请求
        const response = await handler(request, context)

        // 添加 Rate Limit 响应头
        Object.entries(rateLimitHeaders).forEach(([key, value]) => {
          response.headers.set(key, value)
        })

        return response
      }

      // 直接处理
      return await handler(request, context)
    } catch (error: any) {
      console.error('API Error:', error)
      return NextResponse.json(
        { error: error.message || '服务器错误' },
        { status: error.status || 500 },
      )
    }
  }
}
