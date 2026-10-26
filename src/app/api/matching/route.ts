// src/app/api/matching/route.ts
// POST /api/matching       — trigger matching run
// GET  /api/matching       — list matches with filters

import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { runPropertyMatching, getMatches, getMatchSummary } from "@/modules/matching/matching.service";

export async function POST(request: NextRequest) {
  const auth = authenticate(request, {
    requiredPermission: { resource: "properties", action: "read" },
  });
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const propertyId = body.propertyId as string | undefined;

    const result = await runPropertyMatching(auth.tenantId, propertyId);
    const summary = await getMatchSummary(auth.tenantId);

    return apiSuccess({
      newMatches: result.created,
      updatedMatches: result.updated,
      removedMatches: result.removed,
      comparisonsScanned: result.scanned,
      durationMs: result.duration,
      matches: result.matches,
      summary,
    });
  } catch (error: any) {
    if (error.message === "Property not found") return apiError(error.message, 404);
    console.error("Matching error:", error);
    return apiError(error.message || "Matching failed", 500);
  }
}

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;

  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const result = await getMatches(auth.tenantId, {
      matchType: params.matchType,
      status: params.status,
      minScore: params.minScore ? Number(params.minScore) : undefined,
      propertyId: params.propertyId,
      page: params.page ? Number(params.page) : 1,
      limit: params.limit ? Number(params.limit) : 20,
    });

    const summary = await getMatchSummary(auth.tenantId);

    return apiSuccess({ ...result, summary });
  } catch (error: any) {
    return apiError(error.message || "Failed to fetch matches", 500);
  }
}
