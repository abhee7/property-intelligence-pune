// GET  /api/properties/:id/risk — stored risk score with per-factor evidence
// POST /api/properties/:id/risk — recompute it now from the latest data

import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { prisma } from "@/lib/db/client";
import { computeAndSaveRisk, getPropertyRisk } from "@/modules/risk/risk.service";

interface Params { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    const property = await prisma.property.findFirst({ where: { id, tenantId: auth.tenantId, deletedAt: null }, select: { id: true } });
    if (!property) return apiError("Property not found", 404);

    const risk = await getPropertyRisk(auth.tenantId, id);
    if (!risk) return apiSuccess({ risk: null, factors: [], flags: [] });

    const { factors, flags, ...summary } = risk;
    return apiSuccess({ risk: summary, factors, flags });
  } catch (error: any) {
    return apiError(error.message || "Failed to fetch risk data", 500);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = authenticate(request, { requiredPermission: { resource: "properties", action: "update" } });
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    // ?ai=1 → also ask Claude to write the narrative (otherwise the rule-based text is used,
    // and an existing Claude narrative is kept if the underlying data hasn't changed)
    const wantsAi = request.nextUrl.searchParams.get("ai") === "1";
    const result = await computeAndSaveRisk(auth.tenantId, id, { trigger: wantsAi ? "manual" : "event" });
    if (!result) return apiError("Property not found", 404);

    const risk = await getPropertyRisk(auth.tenantId, id);
    const { factors, flags, ...summary } = risk!;
    return apiSuccess({ risk: summary, factors, flags, narrativeStatus: result.narrativeStatus });
  } catch (error: any) {
    console.error("Risk recompute error:", error);
    return apiError(error.message || "Failed to recompute risk", 500);
  }
}
