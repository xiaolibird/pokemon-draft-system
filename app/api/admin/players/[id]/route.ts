import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";

export async function PATCH(request: Request, context: any) {
  const { id } = await context.params;

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;

    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { username } = body;

    if (!username || typeof username !== "string") {
      return NextResponse.json({ error: "Invalid username" }, { status: 400 });
    }

    const player = await prisma.player.update({
      where: { id },
      data: { username },
    });

    return NextResponse.json(player);
  } catch (error) {
    console.error("Update player error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
