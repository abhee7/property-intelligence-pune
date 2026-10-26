// src/app/api/matching/[id]/route.ts

import { NextRequest } from "next/server";
import { recordAudit } from "@/lib/audit";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { getMatchById, resolveMatch } from "@/modules/matching/matching.service";

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const match = await getMatchById(auth.tenantId, id);
  if (!match) return apiError("Match not found", 404);
  return apiSuccess({ match });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = authenticate(request, {
    requiredPermission: { resource: "properties", action: "update" },
  });
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    const body = await request.json();
    const action = body.action as "confirmed" | "dismissed";
    if (!["confirmed", "dismissed"].includes(action)) {
      return apiError("Action must be 'confirmed' or 'dismissed'", 400);
    }

    const match = await resolveMatch(auth.tenantId, id, auth.userId, action);
    if (!match) return apiError("Match not found", 404);
    await recordAudit({ tenantId: auth.tenantId, userId: auth.userId, action: `match.${action}`, resourceType: "match", resourceId: id }, request);

    return apiSuccess({ match });
  } catch (error: any) {
    return apiError(error.message || "Failed to resolve match", 500);
  }
}
