import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";
import { apiError } from "@/app/lib/errors";

export async function PATCH(request: Request, context: any) {
  const { id } = await context.params;

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;

    if (!token)
      return apiError("Unauthorized", "UNAUTHORIZED", { status: 401 });

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return apiError("Unauthorized", "UNAUTHORIZED", { status: 401 });
    }

    const body = await request.json();
    const { username } = body;

    if (!username || typeof username !== "string") {
      return apiError("Invalid username", "INVALID_USERNAME", { status: 400 });
    }

    const player = await prisma.player.update({
      where: { id },
      data: { username },
    });

    return NextResponse.json(player);
  } catch (error) {
    console.error("Update player error:", error);
    return apiError("Internal server error", "INTERNAL_SERVER_ERROR", {
      status: 500,
    });
  }
}
