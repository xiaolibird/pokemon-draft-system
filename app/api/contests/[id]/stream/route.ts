import { verifyToken } from "@/app/lib/auth/jwt";
import { prisma } from "@/app/lib/db/prisma";
import { cookies } from "next/headers";
import { apiError } from "@/app/lib/errors";
import {
  registerConnection,
  unregisterConnection,
  sendContestState,
} from "@/app/lib/sse/server";

export async function GET(request: Request, context: any) {
  const { id: contestId } = await context.params;

  // Verify authorization
  const cookieStore = await cookies();
  const adminToken = cookieStore.get("admin_token")?.value;
  const playerToken = cookieStore.get("player_token")?.value;

  if (!adminToken && !playerToken) {
    return apiError("未授权", "UNAUTHORIZED", { status: 401 });
  }

  // Verify token and check contest access
  let hasAccess = false;

  if (adminToken) {
    try {
      const payload = await verifyToken(adminToken);
      if (payload && payload.role === "admin") {
        const contest = await prisma.contest.findFirst({
          where: {
            id: contestId,
            adminId: payload.id as string,
          },
        });
        hasAccess = !!contest;
      }
    } catch (err) {
      console.error("Admin token verification failed:", err);
    }
  }

  if (!hasAccess && playerToken) {
    try {
      const payload = await verifyToken(playerToken);
      if (payload && payload.role === "player") {
        const player = await prisma.player.findFirst({
          where: {
            id: payload.id as string,
            contestId: contestId,
          },
        });
        hasAccess = !!player;
      }
    } catch (err) {
      console.error("Player token verification failed:", err);
    }
  }

  if (!hasAccess) {
    return apiError("无权访问此比赛", "FORBIDDEN", { status: 403 });
  }

  // Verify contest exists
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
  });

  if (!contest) {
    return apiError("比赛未找到", "CONTEST_NOT_FOUND", { status: 404 });
  }

  // Create SSE stream
  let controllerRef: ReadableStreamDefaultController | null = null;
  const stream = new ReadableStream({
    start(controller) {
      controllerRef = controller;
      try {
        registerConnection(contestId, controller);
      } catch (err) {
        controller.error(err);
        return;
      }

      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "connected", contestId })}\n\n`,
        ),
      );
      sendContestState(contestId, controller, "FULL");

      const cleanup = () => {
        if (controllerRef) {
          unregisterConnection(contestId, controllerRef);
          controllerRef = null;
        }
      };
      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      if (controllerRef) {
        unregisterConnection(contestId, controllerRef);
        controllerRef = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
