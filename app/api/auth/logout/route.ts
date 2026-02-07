import { NextResponse } from "next/server";
import { isSecureContext } from "@/app/lib/contexts/secure";

function clearAdminCookie(request: Request) {
  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully",
  });
  response.cookies.set("admin_token", "", {
    httpOnly: true,
    secure: isSecureContext(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function POST(request: Request) {
  return clearAdminCookie(request);
}

/**
 * GET 登出：重定向到登录页（供非 Chrome/无 JS 的链接降级）
 */
export async function GET(request: Request) {
  const res = NextResponse.redirect(new URL("/admin/login", request.url));
  res.cookies.set("admin_token", "", {
    httpOnly: true,
    secure: isSecureContext(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
