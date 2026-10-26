// src/app/api/properties/[id]/route.ts
// GET    /api/properties/:id  — full detail with relations
// PATCH  /api/properties/:id  — update
// DELETE /api/properties/:id  — soft delete

import { NextRequest } from "next/server";
import { authenticate, apiSuccess, apiError } from "@/lib/auth/middleware";
import { updatePropertySchema } from "@/lib/validation/property.schema";
import { getPropertyById, updateProperty, deleteProperty } from "@/modules/properties/property.service";

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = authenticate(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    const property = await getPropertyById(auth.tenantId, id);

    if (!property) {
      return apiError("Property not found", 404);
    }

    // Land owners can only see their own properties
    if (auth.role === "land_owner" && property.owner?.id !== auth.userId) {
      return apiError("You do not have access to this property", 403);
    }

    return apiSuccess({ property });
  } catch (error) {
    console.error("Property get error:", error);
    return apiError("Failed to fetch property", 500);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = authenticate(request, {
    requiredPermission: { resource: "properties", action: "update" },
  });
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = updatePropertySchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    // Brokers can only update their own listings
    if (auth.role === "broker") {
      const existing = await getPropertyById(auth.tenantId, id);
      if (!existing || existing.broker?.id !== auth.userId) {
        return apiError("You can only edit your own listings", 403);
      }
    }

    const property = await updateProperty(auth.tenantId, id, parsed.data);
    return apiSuccess({ property });
  } catch (error: any) {
    if (error.message === "Property not found") {
      return apiError("Property not found", 404);
    }
    console.error("Property update error:", error);
    return apiError("Failed to update property", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = authenticate(request, {
    requiredPermission: { resource: "properties", action: "delete" },
  });
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    await deleteProperty(auth.tenantId, id);
    return apiSuccess({ message: "Property archived" });
  } catch (error) {
    console.error("Property delete error:", error);
    return apiError("Failed to delete property", 500);
  }
}
