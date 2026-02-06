/**
 * Rate Limiting 中间件
 * 防止 API 滥用和 DDoS 攻击
 */

interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()
const MAX_ENTRIES = 10000 // 最大存储条目数

// 清理过期记录（每1分钟）
setInterval(() => {
  const now = Date.now()
  let cleaned = 0

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
      cleaned++
    }
  }

  // 如果超过最大条目数，清理最旧的记录
  if (rateLimitStore.size > MAX_ENTRIES) {
    const entries = Array.from(rateLimitStore.entries()).sort(
      (a, b) => a[1].resetTime - b[1].resetTime,
    )

    const toRemove = rateLimitStore.size - MAX_ENTRIES
    for (let i = 0; i < toRemove; i++) {
      rateLimitStore.delete(entries[i][0])
      cleaned++
    }
  }

  if (cleaned > 0) {
    console.log(
      `[Rate Limit] Cleaned ${cleaned} expired entries, current size: ${rateLimitStore.size}`,
    )
  }
}, 60 * 1000) // 每1分钟清理一次

export interface RateLimitConfig {
  /**
   * 时间窗口内允许的最大请求数
   */
  maxRequests: number

  /**
   * 时间窗口（毫秒）
   */
  windowMs: number

  /**
   * 自定义键生成函数（默认使用 IP）
   */
  keyGenerator?: (request: Request) => string

  /**
   * 是否跳过限制（用于白名单）
   */
  skip?: (request: Request) => boolean
}

export const defaultRateLimitConfig: RateLimitConfig = {
  maxRequests: 100, // 每分钟100个请求
  windowMs: 60 * 1000, // 1分钟
}

/**
 * 获取客户端 IP
 */
function getClientIP(request: Request): string {
  // 检查常见的代理头
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }

  // 从URL中提取（Next.js开发环境）
  const url = new URL(request.url)
  return url.hostname || 'unknown'
}

/**
 * Rate Limit 检查函数
 *
 * @returns { allowed: boolean, remaining: number, resetTime: number }
 */
export function checkRateLimit(
  request: Request,
  config: RateLimitConfig = defaultRateLimitConfig,
): {
  allowed: boolean
  remaining: number
  resetTime: number
  limit: number
} {
  // 检查是否跳过
  if (config.skip?.(request)) {
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetTime: Date.now() + config.windowMs,
      limit: config.maxRequests,
    }
  }

  // 生成键（不同配置使用不同 bucket，避免 strict/playerLogin/draftAction 共用计数）
  const baseKey = config.keyGenerator?.(request) || getClientIP(request)
  const key = `${baseKey}:${config.windowMs}:${config.maxRequests}`
  const now = Date.now()

  // 获取或创建记录
  let entry = rateLimitStore.get(key)

  if (!entry || now > entry.resetTime) {
    // 创建新记录
    entry = {
      count: 0,
      resetTime: now + config.windowMs,
    }
    rateLimitStore.set(key, entry)
  }

  // 增加计数
  entry.count++

  const allowed = entry.count <= config.maxRequests
  const remaining = Math.max(0, config.maxRequests - entry.count)

  return {
    allowed,
    remaining,
    resetTime: entry.resetTime,
    limit: config.maxRequests,
  }
}

/**
 * Rate Limit 响应头
 */
export function getRateLimitHeaders(result: ReturnType<typeof checkRateLimit>) {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
  }
}

/**
 * 预定义的 Rate Limit 配置
 */
export const rateLimitConfigs = {
  // 严格限制（登录、注册等敏感操作）
  strict: {
    maxRequests: 5,
    windowMs: 60 * 1000, // 1分钟5次
    // 开发环境跳过速率限制（E2E 测试需要）
    skip: (request: Request) => {
      // 检查是否是开发环境
      if (process.env.NODE_ENV === 'development') {
        // 如果设置了 RATE_LIMIT_DEV=true，则强制启用速率限制
        if (process.env.RATE_LIMIT_DEV === 'true') {
          return false
        }
        return true // 开发环境默认跳过
      }
      return false
    },
  } as RateLimitConfig,

  // 标准限制（普通 API）
  standard: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1分钟100次
  } as RateLimitConfig,

  // 宽松限制（读取操作）
  relaxed: {
    maxRequests: 300,
    windowMs: 60 * 1000, // 1分钟300次
  } as RateLimitConfig,

  // 实时更新限制（SSE、轮询）
  realtime: {
    maxRequests: 1000,
    windowMs: 60 * 1000, // 1分钟1000次
  } as RateLimitConfig,

  // 选手登录（按规模预留：32人×2次/分钟 + 余量，不超硬件负载）
  playerLogin: {
    maxRequests: 80,
    windowMs: 60 * 1000, // 1分钟80次（支持32人场+登出重登）
  } as RateLimitConfig,

  // 选秀操作（选人/提名/出价/结算/管理控制）
  draftAction: {
    maxRequests: 300,
    windowMs: 60 * 1000, // 1分钟300次（8人×6只+管理操作+版本冲突重试）
  } as RateLimitConfig,
}

/**
 * 创建 Rate Limit 中间件
 */
export function createRateLimitMiddleware(
  config: RateLimitConfig = defaultRateLimitConfig,
) {
  return async (request: Request) => {
    const result = checkRateLimit(request, config)
    const headers = getRateLimitHeaders(result)

    if (!result.allowed) {
      return new Response(
        JSON.stringify({
          error: '请求过于频繁，请稍后再试',
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil(
              (result.resetTime - Date.now()) / 1000,
            ).toString(),
            ...headers,
          },
        },
      )
    }

    return { headers }
  }
}
