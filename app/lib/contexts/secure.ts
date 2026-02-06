/**
 * HTTP/HTTPS 安全上下文
 * 根据 X-Forwarded-Proto（Nginx 透传）或 USE_HTTPS 环境变量判断当前是否 HTTPS
 * - 当前 HTTP 部署（无域名）：X-Forwarded-Proto=http，secure=false
 * - 未来 HTTPS 部署：X-Forwarded-Proto=https 或 USE_HTTPS=true，secure=true
 */

export function isSecureContext(request?: Request): boolean {
  if (process.env.USE_HTTPS === 'true') return true
  const proto = request?.headers?.get?.('x-forwarded-proto')
  // 只有真正检测到 HTTPS 时才启用 secure 属性
  // 避免生产环境下通过 IP (HTTP) 访问时 Cookie 被浏览器拒绝
  return proto === 'https'
}
