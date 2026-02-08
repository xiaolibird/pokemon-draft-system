/**
 * 审计日志查询 API
 * GET /api/admin/audit-logs
 *
 * 仅管理员可访问
 */

import { NextResponse } from "next/server";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";
import { getAuditLogs } from "@/app/lib/middleware/audit";
import { apiError } from "@/app/lib/errors";

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;

    if (!token) {
      return apiError("未授权", "UNAUTHORIZED", { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return apiError("无权访问", "FORBIDDEN", { status: 403 });
    }

    // 解析查询参数
    const url = new URL(request.url);

    // 日期范围
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const filters: any = {
      userId: url.searchParams.get("userId") || undefined,
      action: url.searchParams.get("action") || undefined,
      resource: url.searchParams.get("resource") || undefined,
      resourceId: url.searchParams.get("resourceId") || undefined,
      status: url.searchParams.get("status") as any,
      limit: parseInt(url.searchParams.get("limit") || "100"),
    };

    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    const logs = await getAuditLogs(filters);

    return NextResponse.json({
      logs,
      count: logs.length,
      filters,
    });
  } catch (error: any) {
    console.error("Audit logs fetch error:", error);
    return apiError("服务器错误", "INTERNAL_SERVER_ERROR", { status: 500 });
  }
}
