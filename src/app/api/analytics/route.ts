// src/app/api/analytics/route.ts
// GET /api/analytics          — full dashboard data
// GET /api/analytics?export=csv — CSV download

import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { computeAnalytics, exportAnalyticsCSV } from "@/modules/analytics/analytics.service";

export async function GET(request: NextRequest) {
  const auth = authenticate(request, {
    requiredPermission: { resource: "analytics", action: "read" },
  });
  if (auth instanceof Response) return auth;

  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);

    // CSV export
    if (params.export === "csv") {
      const csv = await exportAnalyticsCSV(auth.tenantId);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="propintel-analytics-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    const dashboard = await computeAnalytics(auth.tenantId);
    return apiSuccess({ dashboard });
  } catch (error: any) {
    console.error("Analytics error:", error);
    return apiError(error.message || "Failed to compute analytics", 500);
  }
}
