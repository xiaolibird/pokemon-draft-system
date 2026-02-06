import { NextResponse } from 'next/server'
import { isSecureContext } from '@/app/lib/contexts/secure'

/**
 * 获取用于清除 player_token cookie 的配置
 */
function getCookieClearConfig(request: Request) {
  return {
    httpOnly: true,
    secure: isSecureContext(request),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  }
}

/**
 * 玩家登出 - 清除 httpOnly 的 player_token
 * POST: JSON 响应（供 fetch 使用）
 * GET: 重定向到登录页（供直接访问/链接降级）
 */
export async function POST(request: Request) {
  const res = NextResponse.json({ success: true })
  res.cookies.set('player_token', '', getCookieClearConfig(request))
  return res
}

export async function GET(request: Request) {
  const res = NextResponse.redirect(new URL('/player/login', request.url))
  res.cookies.set('player_token', '', getCookieClearConfig(request))
  return res
}
