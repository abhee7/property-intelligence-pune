// src/app/api/properties/route.ts
// GET  /api/properties  — search with filters + pagination
// POST /api/properties  — create new property

import { NextRequest } from "next/server";
import { recordAudit } from "@/lib/audit";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { propertySearchSchema, createPropertySchema } from "@/lib/validation/property.schema";
import { searchProperties, createProperty, getPropertyStats, findDuplicates } from "@/modules/properties/property.service";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;

  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = propertySearchSchema.safeParse(params);

    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    // Role-based scoping
    const input = { ...parsed.data };

    // Brokers see only their own properties unless searching
    if (auth.role === "broker" && !input.q) {
      input.brokerId = auth.userId;
    }
    // Land owners see only their own properties
    if (auth.role === "land_owner") {
      input.ownerId = auth.userId;
    }

    const result = await searchProperties(auth.tenantId, input);

    return apiSuccess({
      properties: result.properties,
      pagination: {
        page: result.page,
        totalPages: result.totalPages,
        total: result.total,
        limit: parsed.data.limit,
      },
    });
  } catch (error) {
    console.error("Property search error:", error);
    return apiError("Failed to search properties", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = authenticate(request, {
    requiredPermission: { resource: "properties", action: "create" },
  });
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const parsed = createPropertySchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    // Warn about an existing survey number first; ?force=true creates it anyway
    // (the matching engine then reviews the pair as a duplicate / conflict candidate)
    const force = request.nextUrl.searchParams.get("force") === "true";
    if (parsed.data.surveyNumber && !force) {
      const duplicates = await findDuplicates(auth.tenantId, parsed.data.surveyNumber);
      if (duplicates.length > 0) {
        return apiSuccess({
          warning: "potential_duplicate",
          message: `A property with survey number ${parsed.data.surveyNumber} already exists`,
          existingProperties: duplicates,
          proceedUrl: "/api/properties?force=true",
        }, 200);
      }
    }

    const property = await createProperty(auth.tenantId, auth.userId, parsed.data);
    await recordAudit({ tenantId: auth.tenantId, userId: auth.userId, action: "property.create", resourceType: "property", resourceId: (property as any)?.id, metadata: { surveyNumber: parsed.data.surveyNumber } }, request);

    return apiSuccess({ property }, 201);
  } catch (error) {
    console.error("Property create error:", error);
    return apiError("Failed to create property", 500);
  }
}
