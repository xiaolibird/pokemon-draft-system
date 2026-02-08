import { verifyToken } from "@/app/lib/auth/jwt";
import { updatePlayerActivity } from "@/app/lib/business/player";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiError } from "@/app/lib/errors";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("player_token")?.value;

    if (!token) {
      return apiError("Unauthorized", "UNAUTHORIZED", { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload || !payload.id) {
      return apiError("Invalid token", "INVALID_TOKEN", { status: 401 });
    }

    // Update activity
    await updatePlayerActivity(payload.id as string);

    return NextResponse.json({ success: true, timestamp: Date.now() });
  } catch (error) {
    console.error("Heartbeat error:", error);
    return apiError("Internal server error", "INTERNAL_SERVER_ERROR", {
      status: 500,
    });
  }
}
