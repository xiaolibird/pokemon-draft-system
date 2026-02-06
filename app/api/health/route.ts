/**
 * 健康检查端点
 * GET /api/health
 *
 * 用于:
 * - 负载均衡器健康检查
 * - 监控系统检查
 * - 容器编排（Docker/K8s）
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  uptime: number
  version: string
  checks: {
    database: {
      status: 'up' | 'down'
      responseTime?: number
      error?: string
    }
    memory: {
      used: number
      free: number
      total: number
      percentage: number
    }
    system: {
      platform: string
      nodeVersion: string
    }
  }
}

const startTime = Date.now()

export async function GET() {
  const start = Date.now()
  const result: HealthCheckResult = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version || '0.2.0',
    checks: {
      database: {
        status: 'down',
      },
      memory: {
        used: 0,
        free: 0,
        total: 0,
        percentage: 0,
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
      },
    },
  }

  // 检查数据库连接
  try {
    const dbStart = Date.now()
    await prisma.$queryRaw`SELECT 1`
    const dbTime = Date.now() - dbStart

    result.checks.database = {
      status: 'up',
      responseTime: dbTime,
    }
  } catch (error: any) {
    result.checks.database = {
      status: 'down',
      error: error.message,
    }
    result.status = 'unhealthy'
  }

  // 检查内存使用
  try {
    const memUsage = process.memoryUsage()
    const totalMem = memUsage.heapTotal
    const usedMem = memUsage.heapUsed
    const freeMem = totalMem - usedMem

    result.checks.memory = {
      used: Math.round(usedMem / 1024 / 1024), // MB
      free: Math.round(freeMem / 1024 / 1024), // MB
      total: Math.round(totalMem / 1024 / 1024), // MB
      percentage: Math.round((usedMem / totalMem) * 100),
    }

    // 如果内存使用超过95%，标记为降级
    // 注意：这里的内存是 Node.js heap，不是容器总内存
    if (result.checks.memory.percentage > 95) {
      result.status = result.status === 'unhealthy' ? 'unhealthy' : 'degraded'
    }
  } catch (error) {
    console.error('Memory check failed:', error)
  }

  // 根据状态返回不同的 HTTP 状态码
  const statusCode =
    result.status === 'healthy' ? 200 : result.status === 'degraded' ? 200 : 503

  return NextResponse.json(result, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Health-Check': 'true',
    },
  })
}

/**
 * HEAD 请求用于快速检查（不返回详细信息）
 */
export async function HEAD() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return new Response(null, { status: 200 })
  } catch {
    return new Response(null, { status: 503 })
  }
}
