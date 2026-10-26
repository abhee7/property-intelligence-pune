import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db/client";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;

  try {
    const [
      totalProperties, verifiedProperties, highRiskScores,
      activeCases, pendingDocs, newsMentions, recentProperties, statusCounts,
    ] = await Promise.all([
      prisma.property.count({ where: { tenantId: auth.tenantId, deletedAt: null } }),
      prisma.property.count({ where: { tenantId: auth.tenantId, status: "VERIFIED", deletedAt: null } }),
      prisma.riskScore.count({ where: { tenantId: auth.tenantId, riskLevel: { in: ["HIGH", "CRITICAL"] } } }),
      prisma.courtCase.count({ where: { tenantId: auth.tenantId, caseStatus: "ACTIVE" } }),
      prisma.document.count({ where: { ocrStatus: "PENDING", deletedAt: null } }),
      prisma.newspaperPropertyMention.count({ where: { tenantId: auth.tenantId } }),
      prisma.property.findMany({
        where: { tenantId: auth.tenantId, deletedAt: null },
        orderBy: { createdAt: "desc" }, take: 5,
        select: { id: true, title: true, status: true, createdAt: true },
      }),
      prisma.property.groupBy({
        by: ["status"],
        where: { tenantId: auth.tenantId, deletedAt: null },
        _count: true,
      }),
    ]);

    return apiSuccess({
      kpis: {
        totalProperties, verifiedProperties,
        verificationRate: totalProperties > 0 ? Math.round((verifiedProperties / totalProperties) * 100) : 0,
        highRiskCount: highRiskScores, activeCases, pendingDocs, newsMentions,
      },
      recentProperties,
      statusBreakdown: statusCounts.map((s: any) => ({ status: s.status, count: s._count })),
    });
  } catch (error: any) {
    return apiError(error.message || "Failed to fetch dashboard data", 500);
  }
}
