// GET  /api/properties/:id/court-search?litigant=…&q=…  — search live court records (eCourtsIndia); candidates only
// POST /api/properties/:id/court-search  { cnr }        — fetch that case in full and link it to the property
//
// Both calls are billed by the provider, so they only run when a person asks for them.

import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { EcourtsError, isEcourtsConfigured } from "@/modules/court/ecourts.client";
import { linkCaseToProperty, lookupForProperty } from "@/modules/court/court-lookup.service";

interface Params { params: Promise<{ id: string }> }

const STATUS: Record<EcourtsError["code"], number> = { not_configured: 503, auth: 502, not_found: 404, rate_limited: 429, api: 502, network: 504 };

function fail(error: any) {
  if (error instanceof EcourtsError) return apiError(error.message, STATUS[error.code]);
  if (error?.message === "Property not found") return apiError("Property not found", 404);
  console.error("[court-search]", error);
  return apiError(error?.message || "Court lookup failed", 500);
}

export async function GET(request: NextRequest, { params }: Params) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (!isEcourtsConfigured()) return apiError("Live court records aren't set up — add ECOURTS_API_KEY to .env.", 503);

  try {
    const sp = request.nextUrl.searchParams;
    const result = await lookupForProperty(auth.tenantId, id, { litigant: sp.get("litigant") ?? undefined, query: sp.get("q") ?? undefined });
    return apiSuccess(result);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = authenticate(request, { requiredPermission: { resource: "properties", action: "update" } });
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (!isEcourtsConfigured()) return apiError("Live court records aren't set up — add ECOURTS_API_KEY to .env.", 503);

  try {
    const body = await request.json().catch(() => ({}));
    const cnr = typeof body?.cnr === "string" ? body.cnr.trim() : "";
    if (!cnr) return apiError("cnr is required", 400);
    return apiSuccess(await linkCaseToProperty(auth.tenantId, id, cnr), 201);
  } catch (error) {
    return fail(error);
  }
}
