// src/app/api/admin/system/route.ts

import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { getSystemHealth, getAuditLogs } from "@/modules/admin/admin.service";

export async function GET(request: NextRequest) {
  const auth = authenticate(request, { requiredRole: "admin" });
  if (auth instanceof Response) return auth;

  const params = Object.fromEntries(request.nextUrl.searchParams);

  if (params.view === "audit") {
    const result = await getAuditLogs(auth.tenantId, {
      userId: params.userId, action: params.action,
      page: params.page ? Number(params.page) : 1,
    });
    return apiSuccess(result);
  }

  const health = await getSystemHealth(auth.tenantId);
  return apiSuccess({ health });
}
