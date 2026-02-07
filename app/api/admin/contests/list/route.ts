import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "12"));
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;

    if (!token) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    // Build where clause
    const where: any = {
      adminId: payload.id as string,
    };

    if (status && status !== "ALL") {
      where.status = status;
    }

    if (search) {
      where.name = {
        contains: search,
        mode: "insensitive",
      };
    }

    // Execute transactions: count and data
    const [total, contests] = await prisma.$transaction([
      prisma.contest.count({ where }),
      prisma.contest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: { players: true, pokemonPool: true },
          },
        },
      }),
    ]);

    const response = NextResponse.json({
      data: contests,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        current: page,
        limit,
      },
    });

    response.headers.set(
      "Cache-Control",
      "no-store, max-age=0, must-revalidate",
    );
    response.headers.set("Pragma", "no-cache");
    return response;
  } catch (error) {
    console.error("[DEBUG] List contests error:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
