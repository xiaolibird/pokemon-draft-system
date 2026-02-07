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
  const res = await fetch(url, {
    ...options,
    credentials: options.credentials ?? "include",
  });

  // 统一处理 401/403 错误（自动登出）
  if (res.status === 401 || res.status === 403) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("playerId");
      localStorage.removeItem("contestId");
      if (!window.location.pathname.includes("/login")) {
        window.location.href = `/player/login?reason=session_expired`;
      }
    }
  }

  return res;
}
