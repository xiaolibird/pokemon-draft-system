/**
 * 客户端 API 请求封装
 * - 统一 credentials: 'include'（Safari/非 Chrome 等需显式携带 Cookie）
 */

/**
 * 封装 fetch，默认 credentials: 'include'
 * 确保 Safari、Firefox 等非 Chrome 浏览器正确发送 Cookie
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: options.credentials ?? 'include',
  })
}
