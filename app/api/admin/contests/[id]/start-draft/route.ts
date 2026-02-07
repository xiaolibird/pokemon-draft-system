import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";
import { auditFromRequest, AuditActions } from "@/app/lib/middleware/audit";
import { DraftService, DraftError } from "@/app/lib/services/draft-service";

// Start snake draft
export async function POST(request: Request, context: any) {
  const { id } = await context.params;

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;

    if (!token) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const adminExists = await prisma.admin.findUnique({
      where: { id: payload.id as string },
    });
    if (!adminExists) {
      return NextResponse.json({ error: "管理员账号已失效" }, { status: 401 });
    }

    // Call Service
    const result = await DraftService.startDraft(id);

    // 审计：启动选秀
    await auditFromRequest(request, {
      userId: payload.id as string,
      userType: "ADMIN",
      action: AuditActions.START_DRAFT,
      resource: "CONTEST",
      resourceId: id,
      status: "SUCCESS",
      details: {
        contestName: result.contestName,
        playerCount: result.playerCount,
        draftMode: result.draftMode,
        maxPokemon: result.maxPokemon,
      },
    });

    return NextResponse.json({ success: true, draftOrder: result.draftOrder });
  } catch (error: any) {
    if (error instanceof DraftError) {
      return NextResponse.json(
        {
          error: error.message,
          type: error.type,
          details: error.details,
        },
        { status: error.status },
      );
    }
    console.error(error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
