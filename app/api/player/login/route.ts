import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { signToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";
import { isSecureContext } from "@/app/lib/contexts/secure";
import {
  checkRateLimit,
  getRateLimitHeaders,
  rateLimitConfigs,
} from "@/app/lib/middleware/rate-limit";
import { apiError } from "@/app/lib/errors";

export async function POST(request: Request) {
  const expectedHeader = request.headers.get("X-Expected-Players");
  const expectedPlayers = Math.min(
    64,
    Math.max(0, parseInt(expectedHeader || "0", 10) || 0),
  );
  const loginLimit =
    expectedPlayers > 0
      ? Math.min(120, 12 + 3 * expectedPlayers)
      : rateLimitConfigs.playerLogin.maxRequests;
  const rateLimitResult = checkRateLimit(request, {
    ...rateLimitConfigs.playerLogin,
    maxRequests: loginLimit,
  });
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: "登录尝试过于频繁，请稍后再试",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
        timestamp: new Date().toISOString(),
      },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(
            (rateLimitResult.resetTime - Date.now()) / 1000,
          ).toString(),
          ...getRateLimitHeaders(rateLimitResult),
        },
      },
    );
  }
  try {
    const body = await request.json();
    const { accessKey, username } = body;

    if (!accessKey) {
      return apiError("缺少访问密钥", "MISSING_ACCESS_KEY", {
        status: 400,
      });
    }

    const player = await prisma.player.findUnique({
      where: { accessKey },
      include: { contest: true },
    });

    if (!player) {
      return apiError("无效的访问密钥", "INVALID_ACCESS_KEY", {
        status: 404,
      });
    }

    let updatedUsername = player.username;
    // If username provided, update player's display name
    if (username && username.trim()) {
      updatedUsername = username.trim();
      await prisma.player.update({
        where: { id: player.id },
        data: {
          username: updatedUsername,
          isReady: true,
        },
      });
    }

    // Generate JWT Token
    const token = await signToken({
      id: player.id,
      role: "player",
      contestId: player.contestId,
    });

    const response = NextResponse.json({
      playerId: player.id,
      username: updatedUsername,
      contestId: player.contestId,
      contestName: player.contest.name,
      tokens: player.tokens,
    });

    // Set cookie（根据 X-Forwarded-Proto 或 USE_HTTPS 自动适配 HTTP/HTTPS）
    const cookieStore = await cookies();
    cookieStore.set("player_token", token, {
      httpOnly: true,
      secure: isSecureContext(request),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (error) {
    console.error(error);
    return apiError("服务器错误", "INTERNAL_SERVER_ERROR", {
      status: 500,
    });
  }
}
