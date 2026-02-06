import { NextResponse } from 'next/server'

/**
 * 版本检测 API
 * 返回当前构建的版本号，用于前端检测更新
 */
export async function GET() {
  // 从环境变量读取构建版本（部署时注入）
  const buildVersion =
    process.env.BUILD_VERSION || process.env.NEXT_PUBLIC_BUILD_VERSION || 'dev'
  const buildTime = process.env.BUILD_TIME || new Date().toISOString()

  return NextResponse.json(
    {
      version: buildVersion,
      buildTime: buildTime,
      env: process.env.NODE_ENV,
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    },
  )
}
