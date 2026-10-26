import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db/client";
import { recomputeAllRisk } from "@/modules/risk/risk.service";

// POST /api/risk-analysis — recompute every property's risk score from the latest data
export async function POST(request: NextRequest) {
  const auth = authenticate(request, { requiredPermission: { resource: "properties", action: "update" } });
  if (auth instanceof Response) return auth;

  try {
    return apiSuccess(await recomputeAllRisk(auth.tenantId));
  } catch (error: any) {
    console.error("Risk recompute-all error:", error);
    return apiError(error.message || "Failed to recompute risk scores", 500);
  }
}

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;

  try {
    const [riskScores, riskFactors, levelCounts] = await Promise.all([
      prisma.riskScore.findMany({
        where: { tenantId: auth.tenantId },
        include: {
          property: {
            select: {
              id: true,
              title: true,
              surveyNumber: true,
              status: true,
              price: true,
              address: { select: { line1: true, city: true, district: true } },
            },
          },
          factors: {
            include: { factorDef: true },
          },
        },
        orderBy: { overallScore: "desc" },
      }),
      prisma.riskFactorDefinition.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.riskScore.groupBy({
        by: ["riskLevel"],
        where: { tenantId: auth.tenantId },
        _count: true,
      }),
    ]);

    const distribution = levelCounts.reduce((acc: any, cur: any) => {
      acc[cur.riskLevel] = cur._count;
      return acc;
    }, {});

    return apiSuccess({
      riskScores,
      riskFactors,
      distribution,
      highRiskCount: (distribution.HIGH || 0) + (distribution.CRITICAL || 0),
    });
  } catch (error: any) {
    return apiError(error.message || "Failed to fetch risk analysis data", 500);
  }
}
