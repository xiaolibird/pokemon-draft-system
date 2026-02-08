import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";
import { apiError } from "@/app/lib/errors";

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;

    if (!token) {
      return apiError("Unauthorized", "UNAUTHORIZED", { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return apiError("Unauthorized", "UNAUTHORIZED", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || query.length < 2) {
      return NextResponse.json([]);
    }

    const pokemon = await prisma.pokemon.findMany({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { nameCn: { contains: query } },
            ],
          },
          // Filter out non-viable Pokemon (SV Viable only)
          { isNonstandard: null },
        ],
      },
      take: 20,
      orderBy: { num: "asc" },
    });

    return NextResponse.json(pokemon);
  } catch (error) {
    console.error(error);
    return apiError("Internal Error", "INTERNAL_SERVER_ERROR", { status: 500 });
  }
}
