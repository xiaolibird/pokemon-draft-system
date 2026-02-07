import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyPassword } from "@/app/lib/auth/password";
import { signToken } from "@/app/lib/auth/jwt";
import { auditFromRequest, AuditActions } from "@/app/lib/middleware/audit";
import {
  rateLimitConfigs,
  checkRateLimit,
  getRateLimitHeaders,
} from "@/app/lib/middleware/rate-limit";
import { isSecureContext } from "@/app/lib/contexts/secure";

export async function POST(request: Request) {
  // Rate Limiting: 登录接口严格限制
  const rateLimitResult = checkRateLimit(request, rateLimitConfigs.strict);
  const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);

  if (!rateLimitResult.allowed) {
    // 审计：登录被限流
    await auditFromRequest(request, {
      userType: "ADMIN",
      action: AuditActions.ADMIN_LOGIN,
      status: "DENIED",
      details: { reason: "Rate limit exceeded" },
    });

    return NextResponse.json(
      {
        error: "请求过于频繁，请稍后再试",
        retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(
            (rateLimitResult.resetTime - Date.now()) / 1000,
          ).toString(),
          ...rateLimitHeaders,
        },
      },
    );
  }

  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Missing credentials" },
        { status: 400 },
      );
    }

    const admin = await prisma.admin.findUnique({
      where: { username },
    });

    if (!admin) {
      // 审计：用户名不存在
      await auditFromRequest(request, {
        userId: username,
        userType: "ADMIN",
        action: AuditActions.ADMIN_LOGIN,
        status: "FAILED",
        details: { reason: "User not found", username },
      });

      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    const isValid = await verifyPassword(password, admin.passwordHash);

    if (!isValid) {
      // 审计：密码错误
      await auditFromRequest(request, {
        userId: admin.id,
        userType: "ADMIN",
        action: AuditActions.ADMIN_LOGIN,
        status: "FAILED",
        details: { reason: "Wrong password", username },
      });

      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    const token = await signToken({
      id: admin.id,
      role: "admin",
      username: admin.username,
    });

    // 审计：登录成功
    await auditFromRequest(request, {
      userId: admin.id,
      userType: "ADMIN",
      action: AuditActions.ADMIN_LOGIN,
      status: "SUCCESS",
      details: { username: admin.username },
    });

    // Set cookie（根据 X-Forwarded-Proto 或 USE_HTTPS 自动适配 HTTP/HTTPS）
    const response = NextResponse.json({
      success: true,
      admin: { id: admin.id, username: admin.username },
    });
    response.cookies.set("admin_token", token, {
      httpOnly: true,
      secure: isSecureContext(request),
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 1 day
    });

    // 添加 Rate Limit 响应头
    Object.entries(rateLimitHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);

    // 审计：系统错误
    await auditFromRequest(request, {
      userType: "ADMIN",
      action: AuditActions.ADMIN_LOGIN,
      status: "FAILED",
      details: { reason: "System error", error: String(error) },
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
